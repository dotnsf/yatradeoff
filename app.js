//. app.js
var express = require( 'express' ),
    basicAuth = require( 'basic-auth-connect' ),
    bodyParser = require( 'body-parser' ),
    uuidv1 = require( 'uuid/v1' ),
    app = express();
var settings = require( './settings' );

//. Env values
var settings_basic_username = 'BASIC_USERNAME' in process.env ? process.env.BASIC_USERNAME : ( settings.basic_username ? settings.basic_username : "" ); 
var settings_basic_password = 'BASIC_PASSWORD' in process.env ? process.env.BASIC_PASSWORD : ( settings.basic_password ? settings.basic_password : "" ); 
var settings_result_limit = 'BASIC_RESULT_LIMIT' in process.env ? parseInt( process.env.RESULT_LIMIT ) : ( settings.basic_result_limit ? parseInt( settings.result_limit ) : 0 ); 
var settings_cors = 'CORS' in process.env ? process.env.CORS : '';

app.use( bodyParser.urlencoded( { extended: false, limit: '10mb' } ) );
app.use( bodyParser.json({limit: '10mb'}) );
app.use( express.Router() );
app.use( express.static( __dirname + '/public' ) );

if( settings_basic_username && settings_basic_password ){
  app.all( '/analytics*', basicAuth( function( user, pass ){
    return( user === settings.basic_username && pass === settings.basic_password );
  }));
}

if( settings_cors ){
  app.all( '/analytics*', function( req, res, next ){
      res.setHeader( 'Access-Control-Allow-Origin', settings_cors );
      res.setHeader( 'Vary', 'Origin' );
    next();
  });
}


app.post( '/analytics', async function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var body = req.body;
  var limit = 0;
  var offset = 0;

  if( req.query.limit ){
    var _limit = req.query.limit;
    try{
      _limit = parseInt( _limit );
      limit = _limit;
    }catch( e ){
    }
  }
  if( req.query.offset ){
    var _offset = req.query.offset;
    try{
      _offset = parseInt( _offset );
      offset = _offset;
    }catch( e ){
    }
  }

  /* body = {
    subject: "subject",
    columns: [ 
      { key: 'key0', goal: "max" },
      { key: 'key1', goal: "min" },
      { key: 'key2', goal: "min" },
          :
    ],
    options: [ 
      { values: { 'key0': 0, 'key1': 1, 'key2': 2, ... } },
      { values: { 'key0': 10, 'key1': 11, 'key2': 12, ... } },
      { values: { 'key0': 20, 'key1': 21, 'key2': 22, ... } },
          :
    ]
  };

  // もともとの tradeoff analytics が受け付けていたフォーマット

    ↓
  
  body = {
    goals: [ 
      { key: 'key0', goal: 1 },
      { key: 'key1', goal: -1 },
      { key: 'key2', goal: 1 },
      { key: 'key3', goal: 2 },
          :
    ],
    values: [ 
      { id: 'AAA', key0: 0, key1: 1, key2: 2, key3: 3, ... },
      { id: 'BBB', key0: 10, key1: 11, key2: 12, key3: 13, ... },
      { id: 'CCC', key0: 20, key1: 21, key2: 22, key3: 23, ... },
          :
    ]
  }

  // 入力をよりシンプルに変更
  */

  /*
  アルゴリズム：
  (1) ポストデータの values を表形式に正規化（含まれていないデータは 0 とみなす）
  (2) (1) の各列ごとに平均、分散、標準偏差を求める
  (3) (2) の結果から、ユーザーごと（IDごと）に各列の標準偏差値を求める
  (4) (3) までできたら、この結果に ID を付与して一旦保存する

  (5) (4) の結果からユーザー毎の ( goals 値×標準偏差値 ) の和を求める（goals 値が負の場合は小さい標準偏差が小さいほど優遇される）
  (6) (5) の結果からユーザーをソートして、（上位数名を選んで）結果とする
  */
  try{ 
    //. #3
    if( !body || typeof body != 'object '
      || !body.goals || typeof body.goals != 'array' 
      || !body.values || typeof body.values != 'array' ){
      res.status( 400 );
      res.write( JSON.stringify( { status: false, error: 'wrong format for post data.' }, null, 2 ) );
      res.end();
    }else{
      var id = req.query.id;
      var table = null;
      if( id ){
        table = await getTable( id );
      }
      if( !table ){
        //. (1)
        //. ポストデータから全列名を取り出す
        var keynames = [];
        var ids = [];
        body.values.forEach( function( value_record ){
          ids.push( value_record.id );
          Object.keys( value_record ).forEach( function( keyname ){
            if( keynames.indexOf( keyname ) == -1 ){
              keynames.push( keyname );
            }
          });
        });
  
        //. ポストデータの values を正規化された表にする
        var normal_values = {};
        body.values.forEach( function( value_record ){
          var record = {};
          keynames.forEach( function( keyname ){
            if( keyname in value_record ){
              record[keyname] = value_record[keyname];
            }else{
              record[keyname] = 0.0;
            }
          });
          normal_values[value_record.id] = record;
        });
  
        //. (2) 各列ごとに平均、分散、標準偏差を求める
        var avgs = {};
        var vas = {};
        var stds = {};
        keynames.forEach( function( keyname ){
          if( keyname != 'id' ){
            var arr = [];
            ids.forEach( function( id ){
              arr.push( normal_values[id][keyname] );
            });

            var r = getAvgVaStd( arr );
            avgs[keyname] = r.avg;
            vas[keyname] = r.va;
            stds[keyname] = r.std;
          }
        });
  
        //. (3) ユーザー毎に各列の標準偏差値( ( x - avg ) / std )を求める
        var stdevs = {};
        ids.forEach( function( id ){
          var record = {};
          var values = normal_values[id];
          keynames.forEach( function( keyname ){
            if( keyname != 'id' ){
              var stdev = ( values[keyname] - avgs[keyname] ) / stds[keyname];
              record[keyname] = stdev;
            }
          });

          stdevs[id] = record;
        });

        //. (4) この結果に ID を付与して一旦保存する
        id = uuidv1();
        table = {
          id: id,
          normal_values: normal_values,
          avgs: avgs,
          vas: vas,
          stds: stds,
          stdevs: stdevs
        };
  
        await setTable( table, id );
      }
  
      //. (5) ユーザー毎の ( goals 値×標準偏差値 ) の和を求める（goals 値が負の場合は小さい標準偏差が小さいほど優遇される）
      var goals = body.goals;
      var values_by_user = [];
      ids.forEach( function( id ){
        var user_stdevs = table['stdevs'][id];
        var point = 0.0;
  
        goals.forEach( function( goal ){
          point += ( user_stdevs[goal.key] * goal.goal );
        });
        values_by_user.push( { id: id, point: point } );
      });

      //. (6) ユーザーをソートして、（上位数名を選んで）結果とする
      values_by_user.sort( sortByPointDesc );

      if( offset ){
        values_by_user.splice( 0, offset );
      }
      if( limit ){
        values_by_user.splice( limit )
      }

      res.write( JSON.stringify( { status: true, id: id, results: values_by_user }, null, 2 ) );
      res.end();
    }
  }catch( e ){
    console.log( e );
    res.status( 400 );
    res.write( JSON.stringify( { status: false, error: e }, null, 2 ) );
    res.end();
  }
});


//. #2
var client = null;
var db_service_name = 'CLOUDANT';
var settings_db_url = 'DB_URL' in process.env ? process.env.DB_URL : settings.db_url;
var settings_db_apikey = 'DB_APIKEY' in process.env ? process.env.DB_APIKEY : settings.db_apikey;
var settings_db_name = 'DB_NAME' in process.env ? process.env.DB_NAME : settings.db_name;
process.env[db_service_name + '_AUTH_TYPE'] = 'IAM';
if( settings_db_url ){
  process.env[db_service_name + '_URL'] = settings_db_url;
}
if( settings_db_apikey ){
  process.env[db_service_name + '_APIKEY'] = settings_db_apikey;
}

//. DB
var { CloudantV1 } = require( '@ibm-cloud/cloudant' );

//. 環境変数 CLOUDANT_AUTH_TYPE を見て接続する
var client = null;
if( settings_db_apikey && settings_db_url && settings_db_name ){
  client = CloudantV1.newInstance( { serviceName: db_service_name, disableSslVerification: true } );
  client.putDatabase({
    db: settings_db_name
  }).catch( function( err ){
    //console.log( err );
  });
}


var tables = {};
async function getTable( id ){
  return new Promise( ( resolve, reject ) => {
    if( client ){
      client.getDocument( { db: settings_db_name, docId: id, includeDocs: true } ).then( function( result ){
        resolve( result.result );
      }).catch( function( err ){
        console.log( err );
        resolve( null );
      });
    }else{
      if( id in tables ){
        resolve( tables[id] );
      }else{
        resolve( null );
      }
    }
  });
}

async function setTable( table, id ){
  return new Promise( ( resolve, reject ) => {
    if( client ){
      table._id = id;
      client.postDocument( { db: settings_db_name, document: table } ).then( function( result ){
        resolve( result.result );
      }).catch( function( err ){
        console.log( err );
        resolve( null );
      });
    }else{
      tables[id] = table;
      resolve( true );
    }
  });
}

function getAvgVaStd( arr ){
  var avg = 0.0;
  var va = 0.0;
  var std = 0.0;

  //. https://qiita.com/FumioNonaka/items/fee07b53fd277b218c97
  //. 平均
  arr.forEach( function( x ){
    avg += x;
  });
  avg /= arr.length;

  //. 平均との差の２乗
  var sqdif = [];
  arr.forEach( function( x ){
    sqdif.push( ( x - avg ) ** 2 );
  });

  //. 分散
  sqdif.forEach( function( x ){
    va += x;
  });
  va /= sqdif.length;

  //. 標準偏差
  std = Math.sqrt( va );
  

  return { avg: avg, va: va, std: std };
}

function sortByPointDesc( a, b ){
  var r = 0;

  if( a['point'] < b['point'] ){ r = 1; }
  else if( a['point'] > b['point'] ){ r = -1; }

  return r;
}

var port = process.env.PORT || 8080;
app.listen( port );
console.log( "server stating on " + port + " ..." );

