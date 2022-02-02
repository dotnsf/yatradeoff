//. app.js
var express = require( 'express' ),
    sqlite3 = require( "sqlite3" ).verbose(),
    basicAuth = require( 'basic-auth-connect' ),
    bodyParser = require( 'body-parser' ),
    app = express();
var settings = require( './settings' );

//. Env values
var settings_basic_username = 'BASIC_USERNAME' in process.env ? process.env.BASIC_USERNAME : ( settings.basic_username ? settings.basic_username : "" ); 
var settings_basic_password = 'BASIC_PASSWORD' in process.env ? process.env.BASIC_PASSWORD : ( settings.basic_password ? settings.basic_password : "" ); 
var settings_result_limit = 'BASIC_RESULT_LIMIT' in process.env ? parseInt( process.env.RESULT_LIMIT ) : ( settings.basic_result_limit ? parseInt( settings.result_limit ) : 0 ); 

app.use( bodyParser.urlencoded( { extended: false, limit: '10mb' } ) );
app.use( bodyParser.json({limit: '10mb'}) );
app.use( express.Router() );
//app.use( express.static( __dirname + '/public' ) );

if( settings_basic_username && settings_basic_password ){
  app.all( '/dilemmas*', basicAuth( function( user, pass ){
    return( user === settings.basic_username && pass === settings.basic_password );
  }));
}

app.get( '/', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  
  res.write( JSON.stringify( { status: true }, null, 2 ) );
  res.end();
});

app.post( '/dilemmas', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  
  var p = '{}';
  //console.log( req.body );
  var body = req.body;
  /* body = {
    subject: "subject",
    columns: [ 
      { key: 'key0', goal: 'min' },
      { key: 'key1', goal: 'max' },
      { key: 'key2', goal: 'max' },
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
      { key: 'key0', goal: 'min' },
      { key: 'key1', goal: 'max' },
      { key: 'key2', goal: 'max' },
      { key: 'key3', goal: 'min' },
          :
    ],
    values: [ 
      { key0: 0, key1: 1, key2: 2, key3: 3, ... },
      { key0: 10, key1: 11, key2: 12, key3: 13, ... },
      { key0: 20, key1: 21, key2: 22, key3: 23, ... },
          :
    ]
  }

  // 入力をよりシンプルに変更
  */
  var prioritised = ( req.query.prioritised !== undefined ? req.query.prioritised : false );
  var goals = body.goals;
  var values = body.values;

  if( !values || !values.length ){
    var keys = Object.keys( values[0] );

    var db = null;
    try{
      //. スキーマ作成
      db = new sqlite3.Database( ":memory:" );
      db.serialize( function(){
        //. 初期準備
        var sql0 = "CREATE TABLE ids( id text";
        var avgs = new Array( keys.length );
        for( var i = 0; i < keys.length; i ++ ){
          sql0 += ( ", " + keys[i] + " real" ); 
          avgs[i] = 0.0;
        }
        sql0 += ", ids_avg real )";

        //. テーブル作成
        db.run( sql0 );
        //console.log( sql0 );

        //. 列ごとの平均値計算
        for( var j = 0; j < values.length; j ++ ){
          for( var i = 0; i < keys.length; i ++ ){
            avgs[i] += values[j][keys[i]];
          }
        }

        //. データ入力
        var avg_avgs = new Array(values.length);
        var sql1 = "INSERT INTO ids";
        for( var j = 0; j < values.length; j ++ ){
          avg_avgs[j] = 0.0;
          if( j % 500 > 0 ){  //if( j > 0 ){
            sql1 += " UNION ALL";
          }
          sql1 += " SELECT '" + values[j].key + "'";
          var values = values[j].values;
          for( var i = 0; i < keys.length; i ++ ){
            var av = ( values[j][keys[i]] - avgs[i] );
            if( goals[i].goal.toUpperCase() == 'MIN' ){  // ???
              av *= -1;
            }
            sql1 += ( ", " + av );
    
            if( prioritised ){
              avg_avgs[j] += ( av * ( keys.length - i ) ); //. 重み付けあり
            }else{
              avg_avgs[j] += ( av ); //. 重み付けなし
            }
          }
          sql1 += ( ", " + ( avg_avgs[j] / keys.length ) );
  
          //. バルクインサートを 500 件ごとに区切る(http://stackoverflow.com/questions/25257754/sqlitetoo-many-terms-in-compound-select)
          if( j % 500 == 499 ){
            db.run( sql1 );
            sql1 = "INSERT INTO ids";
          }
        }
  
        if( values.length % 500 > 0 ){
          db.run( sql1 );
          //console.log( sql1 );
        }
  
        //. 取得
        var limit = Math.round( values.length / 20 );  //. デフォルトでは上位 5% を表示
        if( settings_result_limit ){
          if( limit > settings_result_limit ){ limit = settings_result_limit; }
        }
        var sql2 = "SELECT rowid, id, ids_avg FROM ids ORDER BY ids_avg DESC LIMIT " + limit;
        //console.log( sql2 );
        var solutions = [];
        db.each( sql2, function( err, row ){
          //console.log( row.rowid + ":" + row.id + " - " + row.ids_avg );
          var solution = {
            "solution_ref": row.id,
            "status": "FRONT"
          };
          solutions.push( solution );
          if( solutions.length == limit ){
            var resolution = {
              "solutions": solutions
            };
            body.resolution = resolution;
            body.preferable_esolutions = [];
  
            res.write( JSON.stringify( { status: true, result: body }, null, 2 ) );
            res.end();
          }else{
            res.status( 400 );
            res.write( JSON.stringify( { status: false, error: '#solutions not matched.' }, null, 2 ) );
            res.end();
          }
        });
      });
    }catch( e ){
      res.status( 400 );
      res.write( JSON.stringify( { status: false, error: e }, null, 2 ) );
      res.end();
    }finally{
      if( db ){
        db.close();
      }
    }
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, error: 'invalid post data.' }, null, 2 ) );
    res.end();
  }

});


var port = process.env.PORT || 8080;
app.listen( port );
console.log( "server stating on " + port + " ..." );

