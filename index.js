const pluralize = require('pluralize');
const {snakeCase} = require('snake-case');

const SCALAR = {
  Int     : 'INTEGER',
  Float   : 'REAL',
  String  : 'TEXT',
  Boolean : 'BOOLEAN',
  Date    : 'DATETIME'
}

pluralize.addPluralRule('person', 'persons');

function getFieldType(type){
  return (type.kind === "NonNullType") ?
      type.type.name.value :
      type.name.value;
}

function getDefaultValue(value, type){
  switch(type){
    case 'Boolean':
      return value ? "TRUE" : "FALSE";
    case 'String':
      return `"${value}"`;
    case 'Int':
    case 'Float':
    default:
      return value;
  }
}

function parseType(type, useDefaultModel) {
  const table = snakeCase(pluralize(type.name.value));
  const lines = [];
  const onDeletes = [];

  let updateTrigger = '';

  if(useDefaultModel){
    //default model have 3 columns: id, created_at and updated_at
    //update_at have trigger after update row
    lines.push("id INTEGER UNIQUE DEFAULT ((( strftime('%s','now') - 1563741060 ) * 100000) + (RANDOM() & 65535)) NOT NULL");
    lines.push("created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL");
    lines.push("updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL");
    updateTrigger = `
CREATE TRIGGER ${table}_updated_at AFTER UPDATE ON ${table} WHEN old.updated_at < CURRENT_TIMESTAMP BEGIN
    UPDATE ${table} SET updated_at = CURRENT_TIMESTAMP WHERE id = old.id;
END;`
  }

  const belongsManys = [];
  const indices = [];

  //read fields
  type.fields.forEach(field => {
    //output sample:
    //first_name TEXT NOT NULL
    //price REAL DEFAULT 0 NOT NULL
    const name = field.name.value;
    const fieldType = getFieldType(field.type);

    if(useDefaultModel && /^(id|created_at|updated_at)$/.test(name)){
      return;
    }

    //parse belongsTo / associateTo
    const isBelongs = /^belongsTo/.test(name);
    const isAssoicateTo = /^associateTo/.test(name);
    if( isBelongs || isAssoicateTo){
      const model = snakeCase(field.type.name.value);
      let fk = pluralize.singular(model) + '_id'

      //check custom foreign key rather than model_id
      field.directives.forEach( directive => {
        switch (directive.name.value) {
          case "foreignKey":
            fk = directive.arguments[0].value.value;
            break;
        }
      });

      lines.push(
        isBelongs ?
          `${fk} INTEGER NOT NULL` :
          `${fk} INTEGER`
      )

      onDeletes.push(
        isBelongs ?
          `FOREIGN KEY (${fk}) REFERENCES ${model} (id) ON DELETE CASCADE`:
          `FOREIGN KEY (${fk}) REFERENCES ${model} (id) ON DELETE SET NULL`
      )
      return;
    }


    if(/^hasAndBelongsToMany/.test(name)){
      const modelA = table;
      const modelB = snakeCase(pluralize(field.type.name.value));
      const jointTableName = pluralize.singular(modelA) + '_' + modelB;
      const fkA = `${pluralize.singular(modelA)}_id`;
      const fkB = `${pluralize.singular(modelB)}_id`;

      belongsManys.push(
`CREATE TABLE ${jointTableName}(
    ${fkA} INTEGER NOT NULL ,
    ${fkB} INTEGER NOT NULL ,
    weight REAL ,
    FOREIGN KEY (${fkA}) REFERENCES ${modelA} (id) ON DELETE CASCADE ,
    FOREIGN KEY (${fkB}) REFERENCES ${modelB} (id) ON DELETE CASCADE
);`)
      return;
    }

    const opts = [];

    let isUnique = false;
    let indexString = "";
    let isPrimary = false;
    let isAutoIncrement = false;
    field.directives.map( directive => {
      switch( directive.name.value ){
        case "default":
          opts.push('DEFAULT ' + getDefaultValue(directive.arguments[0].value.value, fieldType));
          break;
        case "unique":
          isUnique = true;
          opts.push('UNIQUE');
          break;
        case "index":
          // check directive contains UNIQUE
          indexString = `idx_${table}_${name} ON ${table} (${name});`
          break;
        case "primary":
          isPrimary = true;
          break;
        case "autoIncrement":
          isAutoIncrement = true;
          break;
      }
    });

    if(indexString !== ''){
      indices.push( (isUnique ? "CREATE UNIQUE INDEX " : "CREATE INDEX ") + indexString)
    }

    const isNonNull = (field.type.kind === "NonNullType");

    lines.push(
      `${name} ${SCALAR[fieldType]}${(opts.length>0)?" ": ""}${opts.join(" ")}${isNonNull ? " NOT NULL" : ""}${isAutoIncrement ? " AUTO_INCREMENT" : ""}`
    )

    if(isPrimary) {
      lines.push(`PRIMARY KEY (${name})`);
    }
  });

  const belongs_many  = ((belongsManys.length > 0) ? "\n" : "")  + belongsManys.join('\n');
  const indexes       = ((indices.length > 0) ? "\n" : "")       + indices.join('\n');

  return `
CREATE TABLE ${table}(
    ${lines.concat(onDeletes).join(' ,\n    ')}
);${updateTrigger}${belongs_many}${indexes}
`;
}

function getTypeMap(schema){
  const typeMap = new Map();
//  const scalarMap = new Map();
  const types = schema['_typeMap'];
  Object.keys(types).forEach(key => {
    //skip private variable
    if(/^_/.test(key))return;
    //skip primitive scalars
    if(/^(Int|Float|String|Boolean|ID)$/.test(key))return;

    const type = types[key]['astNode'];
    if(type['kind'] === "ObjectTypeDefinition"){
      typeMap.set(key, type);
    }
  });

  return typeMap;
}

function parse(schema, useDefaultModel = true){
  const sqls = []
  getTypeMap(schema).forEach( type => {
    sqls.push(parseType(type, useDefaultModel));
  });

  return sqls.join('\n');
}

function insert(data){
  const lines = [];

  data.forEach((x, k) => {
    const table = snakeCase(pluralize(k));
    const keys = Object.keys(x[0]);
    lines.push(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES ${ x.map( y => `(${Object.keys(y).map(z => `'${String(y[z]).replace(/'/g, "''")}'`).join(', ')})`).join(',\n')};`
    );
  });

  return lines.join('\n');
}

module.exports = {
  getFieldType : getFieldType,
  getDefaultValue: getDefaultValue,
  getTypeMap: getTypeMap,
  parse: parse,
  uid: () => ( ( (Date.now() - 1563741060000) / 1000 ) | 0 ) * 100000 + ((Math.random()*100000) & 65535),
  insert: insert,
  schemaHeader : `
scalar Date
union scalars = Int | Float | String | Boolean
directive @default( value: scalars! ) on FIELD_DEFINITION

directive @unique on FIELD_DEFINITION
directive @index on FIELD_DEFINITION
directive @foreignKey( value: String! ) on FIELD_DEFINITION
directive @primary on FIELD_DEFINITION
directive @autoIncrement on FIELD_DEFINITION
`
}