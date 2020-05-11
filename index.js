const pluralize = require('pluralize');
const {snakeCase} = require('snake-case');

const SCALAR = {
  Int     : 'INTEGER',
  Float   : 'REAL',
  String  : 'TEXT',
  Boolean : 'BOOLEAN',
  Date    : 'DATETIME'
}

function getFieldType(type){
  switch (type.kind){
    case "NonNullType":
      return type.type.name.value;
    case "NamedType":
      return type.name.value
    default:
      throw new Error('undefined type')
  }
}

function getDefaultValue(value){
  switch(typeof value){
    case "boolean":
      return value ? "TRUE" : "FALSE";
    case "string":
      return `"${value}"`;
    default :
      return value;
  }
}

function parseType(type, useDefaultModel) {
  const table = snakeCase(type.name.value);
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
  const uniqueIndices = [];
  const indices = [];

  //read fields
  type.fields.forEach(field => {
    //output sample:
    //first_name TEXT NOT NULL
    //price REAL DEFAULT 0 NOT NULL
    const name = field.name.value;
    if(useDefaultModel && /^(id|created_at|updated_at)$/.test(name)){
      return;
    }

    const isBelongs = /^belongsTo/.test(name);
    const isAssoicateTo = /^associateTo/.test(name);
    if( isBelongs || isAssoicateTo){
      const model = snakeCase(field.type.name.value);
      let fk = pluralize.singular(model) + '_id'

      //check custom foreign key rather than model_id
      field.directives.forEach( directive => {
        if(directive.name.value === "key"){
          fk = directive.arguments[0].value.value + '_id';
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
      const modelB = snakeCase(field.type.name.value);
      const jointTableName = pluralize.singular(modelA) + '_' + modelB;
      const fkA = `${pluralize.singular(modelA)}_id`;
      const fkB = `${pluralize.singular(modelB)}_id`;

      belongsManys.push(`
CREATE TABLE ${jointTableName}(
${fkA} INTEGER NOT NULL,
${fkB} INTEGER NOT NULL,
weight REAL, 
FOREIGN KEY (${fkA}) REFERENCES ${modelA} (id) ON DELETE CASCADE ,
FOREIGN KEY (${fkB}) REFERENCES ${modelB} (id) ON DELETE CASCADE
);`)
      return;
    }

    const opts = [];

    let isUnique = false;
    let indexString = "";
    field.directives.map( directive => {
      switch( directive.name.value ){
        case "default":
          opts.push('DEFAULT ' + getDefaultValue(directive.arguments[0].value.value));
          break;
        case "unique":
          isUnique = true;
          opts.push('UNIQUE');
          break;
        case "index":
          // check directive contains UNIQUE
          indexString = `idx_${table}_${name} ON ${table} (${name});`
          break;
      }
    });

    if(indexString !== ''){
      indices.push( (isUnique ? "CREATE UNIQUE INDEX " : "CREATE INDEX ") + indexString)
    }

    const fieldType = getFieldType(field.type);
    const isNonNull = (field.type.kind === "NonNullType");

    lines.push(
      `${name} ${SCALAR[fieldType]}${(opts.length>0)?" ": ""}${opts.join(" ")}${isNonNull ? " NOT NULL" : ""}`
    )
  });

  const belongs_many  = ((belongsManys.length > 0) ? "\n" : "")  + belongsManys.join('\n');
  const indexes       = ((indices.length > 0) ? "\n" : "")       + indices.join('\n');
  const uniqueIndexes = ((uniqueIndices.length > 0) ? "\n" : "") + uniqueIndices.join('\n');

  return `
CREATE TABLE ${table}(
    ${lines.concat(onDeletes).join(' ,\n    ')}
);${updateTrigger}${belongs_many}${indexes}${uniqueIndexes}
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

    switch(type['kind']){
      case "ObjectTypeDefinition":
        typeMap.set(key, type);
        break;
      case "ScalarTypeDefinition":
      case "InterfaceTypeDefinition":
      case "UnionTypeDefinition":
        break;
      default:
        console.log(type['kind'])
        throw new Error('unknown type')
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

module.exports = {
  parse: parse,
  schemaHeader : `
scalar Date
union scalars = Int | Float | String | Boolean
directive @default( value: scalars! ) on FIELD_DEFINITION

directive @unique on FIELD_DEFINITION
directive @index on FIELD_DEFINITION
directive @foreignKey( value: String! ) on FIELD_DEFINITION
`
}