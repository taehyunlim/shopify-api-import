// Dependencies
var fs = require('fs');
var j2c = require('json-2-csv'); // https://www.npmjs.com/package/json-2-csv
var parse = require('csv-parse');

// Set empty config object
var config = {};

// Shopify API Credential
config.shopify_api_key = ['0000000000000000000000000000000'];
config.shopify_api_pw = ['0000000000000000000000000000000'];
config.shopify_shopname = ['myshopifysite'];

module.exports = config;
