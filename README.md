# YATradeoff

## Overview

Yet Anohter Tradeoff Analytics API with priority.

## Description

This API has been developed as yet anohter IBM Watson Tradeoff Analytics API( https://watson-api-explorer.mybluemix.net/apis/tradeoff-analytics-v1 ), which is going to be retired.

This new API handles compatible input data from original one, and returns subset of originals currently.

## Improvement from original

- New API can handle priority with input data. 

    - If you call /dilemmas with prioritised=1 parameter(/dilemmas?prioritised=1), then your 'columns' array part of your input JSON data would be recognized as 'prioritised' data. In this case, first element of columns data would be recognized as the most prioritized column, and last element of columns data would be recognized as the least prioritised one. 

    - Also response of this API would be stored in 'solutions' array, and they are arranged by priority(first one would be the most prioritised one) in this case.

## Restrictions

- No preferable_solutions returns(always blank).

- Return only solutions which has 'FRONT' status.

- No map information.

## System information

- This API is developed as Node.js(https://nodejs.org/) application. You need to install Node.js first.

- This API would use SQLite(https://sqlite.org/) internally. You don't need to install SQLite, but for internal operation purpose, this API would create temporary table in temporary in-memory db dynamically, and dispose them when finished. 

- This API would return almost top one sixth of entire input data as recommend solutions. If you specify exports.result_limit in settings.js, and if that number would be smaller than one sixth, then this API would return top that number of entire input data.

## Install

- Git clone/download source code from GitHub.

- Edit exports.username and exports.password in settings.js. There would be Basic Authtication to use this API, and they are used as these ID and Password.

- (option)Edit exports.result_limit in settings.js. If you specify this number, then you can restrict return solutions number.

- Run app.js with Node.js( $ node app ).

- You can access `POST /dilemmas` with following post data:

## Licensing

This code is licensed under MIT.


## Copyright

2017-2022 K.Kimura @ Juge.Me all rights reserved.

