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
  })
}

// Main API Request Call function
function getOrders(orderId) {
  console.log("Check lastImportOrderIdStart: "+ orderId);
  request(
    {
      url: baseurl+'/admin/orders.json?financial_status=paid&since_id=' + orderId,
      json: true,
    }, function (error, response, body) {
      // console.log(body.orders); // Debug
      if (error) throw error;
      // If there is no new order found
      if (body.orders.length === 0) {
        console.log("No order received since OrderId: " + orderId);
        return;
      }
      //console.log(response.statusCode);
      if (!error && response.statusCode === 200 && body.orders.length > 0) {
        // Objects Array for Orders
        var ordersList = [];
        // Nested loop through line_items (ln) and order objects (ord)
        for (var i = 0; i < body.orders.length; i++) {

          // BEGIN TEST: CART LEVEL DISCOUNT CODE
          if (body.orders[i].discount_codes[0] != null ) {
            // HARDCODED: ONLY ONE DISCONT CODE TAKEN
            var discount_codes_amount_test = body.orders[i].discount_codes[0].amount;
          } //END TEST

          // Rename iteratee to "ord"
          var ord = body.orders[i];
          for (var j = 0; j < ord.line_items.length; j++) {
            // Declare empty object var for order object "ordObj"
            var orderObj = {
              order_index: 0,
              shopifyOrderId: '',
              shipping_address_name: '',
              shipping_address_1: '',
              shipping_address_2: '',
              shipping_address_city: '',
              shipping_address_state: '',
              shipping_address_zip: '',
              shipping_address_country: '',
              shipping_address_phone: '',
              contact_email: '',
              zinus_po: '',
              created_at: '',
              order_number: '',
              total_price: '',
              total_line_items_price: '',
              subtotal_price: '',
              total_tax: '',
              discount_codes_amount: '',
              total_discounts: '',
              line_items_index: 0,
              line_items: {
                tax_price: '',
                tax_rate: ''
              }
            };
            // Rename iteratee to "ln"
            var ln = ord.line_items[j];
            // Assign ordObj values
            orderObj.order_index = i + 1; // 1-based index
            orderObj.shopifyOrderId = ord.id;
            orderObj.shipping_address_name = ord.shipping_address.name;
            orderObj.shipping_address_1 = ord.shipping_address.address1;
            orderObj.shipping_address_2 = ord.shipping_address.address2;
            orderObj.shipping_address_city = ord.shipping_address.city;
            orderObj.shipping_address_state = ord.shipping_address.province;
            orderObj.shipping_address_zip = ord.shipping_address.zip;
            orderObj.shipping_address_country = ord.shipping_address.country;
            orderObj.shipping_address_phone = ord.shipping_address.phone;
            orderObj.contact_email = ord.contact_email;
            orderObj.zinus_po = "ZC" + ord.order_number;
            orderObj.created_at = ord.created_at;
            orderObj.order_number = ord.order_number;
            orderObj.total_price = ord.total_price;
            orderObj.total_line_items_price = ord.total_line_items_price;
            orderObj.subtotal_price = ord.subtotal_price;
            orderObj.total_tax = ord.total_tax;
            orderObj.discount_codes_amount = discount_codes_amount_test; // HARDCODED
            orderObj.total_discounts = ord.total_discounts;
            orderObj.line_items_index = j + 1; // 1-based index
            // Assign ln values
            orderObj.line_items.sku = ln.sku;
            orderObj.line_items.qty = ln.quantity;
            orderObj.line_items.price = ln.price;
            orderObj.line_items.recycling_fee = "Test";
            orderObj.line_items.discount = ln.total_discount;
            // HARDCODED: ONLY TAKES SINGLE TAX LINE PER LINE ITEM
            if (ln.tax_lines.length > 0) {
              orderObj.line_items.tax_price = ln.tax_lines[0].price
              orderObj.line_items.tax_rate = ln.tax_lines[0].rate
            }
            // Add assigned object to ordersList array
            ordersList.push(orderObj);
          } // end of loop: line_items
        } // end of loop: orders
        console.log('order count: ' + ordersList[ordersList.length-1].order_index);
        console.log('Ending Order_number: ' + ordersList[ordersList.length-1].zinus_po);
        console.log('Ending lastImportOrderId: ' + ordersList[ordersList.length-1].shopifyOrderId);
        lastImportOrderIdEnd = ordersList[ordersList.length-1].shopifyOrderId;

        // Convert json objects to csv
        j2c.json2csv(ordersList, j2cCallback);
      };
    } // end of request callback
)}; // end of getOrders funciton

recallOrderNo();
