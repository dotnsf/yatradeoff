//. app.js

var express = require( 'express' ),
    sqlite3 = require( "sqlite3" ).verbose(),
    basicAuth = require( 'basic-auth-connect' ),
    cfenv = require( 'cfenv' ),
    bodyParser = require( 'body-parser' ),
    app = express();
var settings = require( './settings' );
var appEnv = cfenv.getAppEnv();

app.use( bodyParser.urlencoded( { extended: false, limit: '10mb' } ) );
app.use( bodyParser.json({limit: '10mb'}) );
app.use( express.Router() );
app.use( express.static( __dirname + '/public' ) );

app.all( '/dilemmas*', basicAuth( function( user, pass ){
  return( user === settings.basic_username && pass === settings.basic_password );
}));

app.post( '/dilemmas', function( req, res ){
  var p = '{}';
  //console.log( req.body );
  var body = req.body;
  var prioritised = ( req.query.prioritised !== undefined ? req.query.prioritised : false );
  var subject = body.subject;
  var columns = body.columns;
  var options = body.options;

  //. スキーマ作成
  var db = new sqlite3.Database( ":memory:" );
  db.serialize( function(){
    //. 初期準備
    var sql0 = "CREATE TABLE ids( id text";
    var avgs = new Array(columns.length);
    var keynames = new Array(columns.length);
    for( i = 0; i < columns.length; i ++ ){
      sql0 += ( ", " + columns[i].key + " real" ); 
      avgs[i] = 0.0;
      keynames[i] = columns[i].key;
    }
    sql0 += ", ids_avg real )";

    //. テーブル作成
    db.run( sql0 );
    //console.log( sql0 );

    //. 平均計算
    for( j = 0; j < options.length; j ++ ){
      for( i = 0; i < columns.length; i ++ ){
        avgs[i] += options[j].values[keynames[i]];
      }
    }
    for( i = 0; i < columns.length; i ++ ){
      avgs[i] /= options.length;
    }

    //. データ入力
    var avg_avgs = new Array(options.length);
    var sql1 = "INSERT INTO ids";
    for( j = 0; j < options.length; j ++ ){
      avg_avgs[j] = 0.0;
      if( j % 500 > 0 ){  //if( j > 0 ){
        sql1 += " UNION ALL";
      }
      sql1 += " SELECT '" + options[j].key + "'";
      var values = options[j].values;
      for( i = 0; i < columns.length; i ++ ){
        var av = ( values[keynames[i]] - avgs[i] );
        if( columns[i].goal == 'MIN' ){
          av *= -1;
        }
        sql1 += ( ", " + av );

        if( prioritised ){
          avg_avgs[j] += ( av * ( columns.length - i ) ); //. 重み付けあり
        }else{
          avg_avgs[j] += ( av ); //. 重み付けなし
        }
      }
      sql1 += ( ", " + ( avg_avgs[j] / columns.length ) );

      //. バルクインサートを 500 件ごとに区切る(http://stackoverflow.com/questions/25257754/sqlitetoo-many-terms-in-compound-select)
      if( j % 500 == 499 ){
        db.run( sql1 );
        sql1 = "INSERT INTO ids";
      }
    }
    db.run( sql1 );
    //console.log( sql1 );

    //. 取得
    var limit = Math.round( options.length / 6 );
    if( settings.result_limit ){
      if( limit > settings.result_limit ){ limit = settings.result_limit; }
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
        p = JSON.stringify( body );

        res.write( p );
        res.end();
      }
    });
  });
  db.close();
});

app.listen( appEnv.port );
console.log( "server stating on " + appEnv.port + " ..." );

