(function (global, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof exports !== "undefined") {
    factory();
  } else {
    var mod = {
      exports: {}
    };
    factory();
    global.index = mod.exports;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var pluralize = require('pluralize');

  var _require = require('snake-case'),
      snakeCase = _require.snakeCase;

  var SCALAR = {
    Int: 'INTEGER',
    Float: 'REAL',
    String: 'TEXT',
    Boolean: 'BOOLEAN',
    Date: 'DATETIME'
  };

  function getFieldType(type) {
    return type.kind === "NonNullType" ? type.type.name.value : type.name.value;
  }

  function getDefaultValue(value, type) {
    switch (type) {
      case 'Boolean':
        return value ? "TRUE" : "FALSE";

      case 'String':
        return "\"".concat(value, "\"");

      case 'Int':
      case 'Float':
      default:
        return value;
    }
  }

  function parseType(type, useDefaultModel) {
    var table = snakeCase(type.name.value);
    var lines = [];
    var onDeletes = [];
    var updateTrigger = '';

    if (useDefaultModel) {
      //default model have 3 columns: id, created_at and updated_at
      //update_at have trigger after update row
      lines.push("id INTEGER UNIQUE DEFAULT ((( strftime('%s','now') - 1563741060 ) * 100000) + (RANDOM() & 65535)) NOT NULL");
      lines.push("created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL");
      lines.push("updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL");
      updateTrigger = "\nCREATE TRIGGER ".concat(table, "_updated_at AFTER UPDATE ON ").concat(table, " WHEN old.updated_at < CURRENT_TIMESTAMP BEGIN\n    UPDATE ").concat(table, " SET updated_at = CURRENT_TIMESTAMP WHERE id = old.id;\nEND;");
    }

    var belongsManys = [];
    var indices = []; //read fields

    type.fields.forEach(function (field) {
      //output sample:
      //first_name TEXT NOT NULL
      //price REAL DEFAULT 0 NOT NULL
      var name = field.name.value;
      var fieldType = getFieldType(field.type);

      if (useDefaultModel && /^(id|created_at|updated_at)$/.test(name)) {
        return;
      } //parse belongsTo / associateTo


      var isBelongs = /^belongsTo/.test(name);
      var isAssoicateTo = /^associateTo/.test(name);

      if (isBelongs || isAssoicateTo) {
        var model = snakeCase(field.type.name.value);
        var fk = pluralize.singular(model) + '_id'; //check custom foreign key rather than model_id

        field.directives.forEach(function (directive) {
          switch (directive.name.value) {
            case "foreignKey":
              fk = directive.arguments[0].value.value;
              break;
          }
        });
        lines.push(isBelongs ? "".concat(fk, " INTEGER NOT NULL") : "".concat(fk, " INTEGER"));
        onDeletes.push(isBelongs ? "FOREIGN KEY (".concat(fk, ") REFERENCES ").concat(model, " (id) ON DELETE CASCADE") : "FOREIGN KEY (".concat(fk, ") REFERENCES ").concat(model, " (id) ON DELETE SET NULL"));
        return;
      }

      if (/^hasAndBelongsToMany/.test(name)) {
        var modelA = table;
        var modelB = snakeCase(field.type.name.value);
        var jointTableName = pluralize.singular(modelA) + '_' + modelB;
        var fkA = "".concat(pluralize.singular(modelA), "_id");
        var fkB = "".concat(pluralize.singular(modelB), "_id");
        belongsManys.push("CREATE TABLE ".concat(jointTableName, "(\n    ").concat(fkA, " INTEGER NOT NULL ,\n    ").concat(fkB, " INTEGER NOT NULL ,\n    weight REAL ,\n    FOREIGN KEY (").concat(fkA, ") REFERENCES ").concat(modelA, " (id) ON DELETE CASCADE ,\n    FOREIGN KEY (").concat(fkB, ") REFERENCES ").concat(modelB, " (id) ON DELETE CASCADE\n);"));
        return;
      }

      var opts = [];
      var isUnique = false;
      var indexString = "";
      var isPrimary = false;
      var isAutoIncrement = false;
      field.directives.map(function (directive) {
        switch (directive.name.value) {
          case "default":
            opts.push('DEFAULT ' + getDefaultValue(directive.arguments[0].value.value, fieldType));
            break;

          case "unique":
            isUnique = true;
            opts.push('UNIQUE');
            break;

          case "index":
            // check directive contains UNIQUE
            indexString = "idx_".concat(table, "_").concat(name, " ON ").concat(table, " (").concat(name, ");");
            break;

          case "primary":
            isPrimary = true;
            break;

          case "autoIncrement":
            isAutoIncrement = true;
            break;
        }
      });

      if (indexString !== '') {
        indices.push((isUnique ? "CREATE UNIQUE INDEX " : "CREATE INDEX ") + indexString);
      }

      var isNonNull = field.type.kind === "NonNullType";
      lines.push("".concat(name, " ").concat(SCALAR[fieldType]).concat(opts.length > 0 ? " " : "").concat(opts.join(" ")).concat(isNonNull ? " NOT NULL" : "").concat(isAutoIncrement ? " AUTO_INCREMENT" : ""));

      if (isPrimary) {
        lines.push("PRIMARY KEY (".concat(name, ")"));
      }
    });
    var belongs_many = (belongsManys.length > 0 ? "\n" : "") + belongsManys.join('\n');
    var indexes = (indices.length > 0 ? "\n" : "") + indices.join('\n');
    return "\nCREATE TABLE ".concat(table, "(\n    ").concat(lines.concat(onDeletes).join(' ,\n    '), "\n);").concat(updateTrigger).concat(belongs_many).concat(indexes, "\n");
  }

  function getTypeMap(schema) {
    var typeMap = new Map(); //  const scalarMap = new Map();

    var types = schema['_typeMap'];
    Object.keys(types).forEach(function (key) {
      //skip private variable
      if (/^_/.test(key)) return; //skip primitive scalars

      if (/^(Int|Float|String|Boolean|ID)$/.test(key)) return;
      var type = types[key]['astNode'];

      if (type['kind'] === "ObjectTypeDefinition") {
        typeMap.set(key, type);
      }
    });
    return typeMap;
  }

  function parse(schema) {
    var useDefaultModel = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
    var sqls = [];
    getTypeMap(schema).forEach(function (type) {
      sqls.push(parseType(type, useDefaultModel));
    });
    return sqls.join('\n');
  }

  function insert(data) {
    var lines = [];
    data.forEach(function (x, k) {
      var table = snakeCase(k);
      var keys = Object.keys(x[0]);
      lines.push("INSERT INTO ".concat(table, " (").concat(keys.join(', '), ") VALUES ").concat(x.map(function (y) {
        return "(".concat(Object.keys(y).map(function (z) {
          return "'".concat(String(y[z]).replace(/'/g, "''"), "'");
        }).join(', '), ")");
      }).join(',\n'), ";"));
    });
    return lines.join('\n');
  }

  module.exports = {
    getFieldType: getFieldType,
    getDefaultValue: getDefaultValue,
    getTypeMap: getTypeMap,
    parse: parse,
    uid: function uid() {
      return ((Date.now() - 1563741060000) / 1000 | 0) * 100000 + (Math.random() * 100000 & 65535);
    },
    insert: insert,
    schemaHeader: "\nscalar Date\nunion scalars = Int | Float | String | Boolean\ndirective @default( value: scalars! ) on FIELD_DEFINITION\n\ndirective @unique on FIELD_DEFINITION\ndirective @index on FIELD_DEFINITION\ndirective @foreignKey( value: String! ) on FIELD_DEFINITION\ndirective @primary on FIELD_DEFINITION\ndirective @autoIncrement on FIELD_DEFINITION\n"
  };
});