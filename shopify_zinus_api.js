// Dependencies
var request = require('request');
var fs = require('fs');
var parse = require('csv-parse');
var j2c = require('json-2-csv'); // https://www.npmjs.com/package/json-2-csv
var async = require('async');
var RateLimiter = require('limiter').RateLimiter;
var flatten = require('flat');
var moment = require('moment');
var limiter = new RateLimiter(1, 500);

// Import local config files
var config = require('./config.js');

// Shopify API Credential
var apikey = config.shopify_api_key;
var password = config.shopify_api_pw;
var shopname = config.shopify_shopname;

// Global Variables
var baseurl = 'https://'+apikey+':'+password+'@'+shopname+'.myshopify.com';
//var attrFields = '';
var csvFields = ['created_at', 'id', 'name', 'total_price'];
var j2cOptions = { keys: csvFields };
var timestring = moment().format("YYYYMMDD_HHmm");
var fileName = './Incoming/ShopifyOrders_' + timestring +'.csv';
var lastImportOrderIdCsv = 'lastImport.csv'
var lastImportOrderIdStart = '';
var lastImportOrderIdEnd = '';

// Recall last imported order_number
function recallOrderNo(callback) {
  fs.readFile(lastImportOrderIdCsv, function(err, fileData){
    if (err) {
      // Base case when lastImportOrderId DNE
      if (err.code === 'ENOENT') {
        console.error('No lastImport found. Creating lastImport.csv');
        fs.writeFile(lastImportOrderIdCsv, "", function(err) {
          if (err) throw err;
        });
        // Set initial value for lastImportOrderId to 0;
        fileData = '0';
      } else { throw err; }
    }
    parse(fileData, function(err, output) {
      if (err) throw err;
      lastImportOrderIdStart = output[0][0];
      // Run Shopify API call to get orders
      getOrders(lastImportOrderIdStart);
    });
  });
}

// Callback function for json-2-csv
function j2cCallback(err, csv) {
  if (err) throw err;
  // Generate csv for OMDB import
  fs.writeFile(fileName, csv, function(err) {
    if (err) throw err;
    console.log('File saved under: [' + __dirname + ']@[' + timestring + ']');
  });
  // Record last range of order_number to lastImport.csv
  fs.writeFile(lastImportOrderIdCsv, lastImportOrderIdEnd, function(err) {
    if (err) throw err;
    //console.log('Last Import order_number saved');
  })
}

function getOrders(orderId) {
  console.log("Check lastImportOrderIdStart: "+ orderId);
  request(
    {
      url: baseurl+'/admin/orders.json?financial_status=paid&since_id=' + orderId,
      json: true,
    }, function (error, response, body) {
      //console.log(response.statusCode);
      if (!error && response.statusCode === 200 && body.orders.length > 0) {
        var orders = [];
        for (var i = 0; i < body.orders.length; i++) {
          // START OF TEST: HARDCODED DISCOUNT_CODES.LENGTH = 0; USE HEADER DISCOUNT ONLY ONCE
          var discountAmount = '';
          if (body.orders[i].discount_codes[0] != null ) {
            discountAmount = body.orders[i].discount_codes[0].amount;
          }
          // END OF TEST
          var ord = body.orders[i];
          for (var j = 0; j < ord.line_items.length; j++) {
            var orderObj = {
              orderObjIndex: 0,
              shopifyOrderId: '',
              shpName: '',
              shpAdd1: '',
              shpAdd2: '',
              shpCity: '',
              shpState: '',
              shpZip: '',
              shpCountry: '',
              shpPhone: '',
              email: '',
              poNumber: '',
              dateCreated: '',
              poNumberZinus: '',
              headerDisc: '',
              totalDisc: '',
              itemLineNo: 0,
              itemLine: {}
            };
            var ln = ord.line_items[j];
            var lineObj = {
              sku: '',
              qty: '',
              price: '',
              tax: '',
              rcyFee: '',
              itemDisc: ''
            };
            // Start Order Object assignment
            orderObj.orderObjIndex = i;
            orderObj.shopifyOrderId = ord.id;
            orderObj.shpName = ord.shipping_address.name;
            orderObj.shpAdd1 = ord.shipping_address.address1;
            orderObj.shpAdd2 = ord.shipping_address.address2;
            orderObj.shpCity = ord.shipping_address.city;
            orderObj.shpState = ord.shipping_address.province;
            orderObj.shpZip = ord.shipping_address.zip;
            orderObj.shpCountry = ord.shipping_address.country;
            orderObj.shpPhone = ord.shipping_address.phone;
            orderObj.email = ord.contact_email;
            orderObj.poNumber = "ZC" + ord.order_number;
            orderObj.dateCreated = ord.created_at;
            orderObj.poNumberZinus = ord.order_number;
            orderObj.headerDisc = discountAmount;
            orderObj.totalDisc = ord.total_discounts;

            // Start Line Item assignment
            orderObj.itemLineNo = j + 1; // 1-based index
            orderObj.itemLine.sku = ln.sku;
            orderObj.itemLine.qty = ln.quantity;
            orderObj.itemLine.price = ln.price;
            orderObj.itemLine.rcyFee = "Test";
            orderObj.itemLine.itemDisc = ln.total_discount;
            //orderObj.itemLine = lineObj;
            orders.push(orderObj);
          } // end of loop: line_items
        } // end of loop: orders
        //console.log('order count: ' + orders[orders.length-1].orderObjIndex);
        console.log('Ending Order_number: ' + orders[orders.length-1].poNumberZinus);
        console.log('Ending lastImportOrderId: ' + orders[orders.length-1].shopifyOrderId);
        lastImportOrderIdEnd = orders[orders.length-1].shopifyOrderId;

        j2c.json2csv(orders, j2cCallback);
      };
    } // end of request callback
)}; // end of getOrders funciton

recallOrderNo();
