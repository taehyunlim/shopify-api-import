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

// Global variables
var baseurl = 'https://'+apikey+':'+password+'@'+shopname+'.myshopify.com';
var timestring = moment().format("YYYYMMDD_HHmm");
var incomingPathName = './Incoming/' //'ShopifyAPI_Orders_' + timestring +'.csv';
var incomingFileName = 'ShopifyAPI_Orders_'
var importPathName = './Import/' //'OE_NewOrder_' + timestring + '_ZINUS.csv';
var importFileName = 'OE_NewOrder_'
var lastImportCsv = 'lastImport.csv'
var lastImportOrderIdStart = '';
var lastImportOrderIdEnd = '';
var lastDocumentIdStart = '';
var lastDocumentIdEnd = '';

// Recall last imported orderId and document Id.
// Note: Document Id is 1-based index for each order import file created by this API connection
function recallOrderId(callback) {
  fs.readFile(lastImportCsv, function(err, fileData){
    if (err) {
      // Base case when lastImportCsv DNE
      if (err.code === 'ENOENT') {
        console.error('No lastImport found. Creating lastImport.csv');
        fs.writeFile(lastImportCsv, "", function(err) {
          if (err) throw err;
        });
        // Set initial value for lastImportOrderId: 0 & lastDocumentId: 0;
        fileData = '0, 0';
      } else { throw err; }
    }
    // if lastImportCsv is present then parse data and assign to global variables
    parse(fileData, function(err, output) {
      if (err) throw err;
      // Load lastImportOrderId and lastDocumentId from row 0
      lastImportOrderIdStart = output[0][0];
      lastDocumentIdStart = output[0][1];
      console.log('Check lastDocumentIdStart: ' + lastDocumentIdStart);

      // Finally, run Shopify API call to get orders
      getOrders(lastImportOrderIdStart);
    });
  });
}

// Callback function for json-2-csv: Incoming API result file (For archive purpose)
function j2cCallbackIncoming(err, csv) {
  // Update ending lastDocumentId
  lastDocumentIdEnd = parseInt(lastDocumentIdStart) + 1;
  if (err) throw err;
  // Generate csv for Incoming directory
  fs.writeFile(incomingPathName + incomingFileName + timestring + '.csv', csv, function(err) {
    if (err) throw err;
    console.log('File saved under: [' + __dirname + '\\Incoming\\]@[' + timestring + ']');
  });
  // Record last range of order_number to lastImport.csv
  fs.writeFile(lastImportCsv, lastImportOrderIdEnd + ',' + lastDocumentIdEnd, function(err) {
    if (err) throw err;
  })
}

// Callback function for json-2-csv: Import file (For OMP)
function j2cCallbackImport(err, csv) {
  if (err) throw err;
  // Generate csv for Import directory
  fs.writeFile(importPathName + importFileName + timestring + '_ZINUS.csv', csv, function(err) {
    if (err) throw err;
    console.log('File saved under: [' + __dirname + '\\Import\\]@[' + timestring + ']');
  });
}

// API Request Call
function getOrders(orderId) {
  console.log("Check lastImportOrderIdStart: "+ orderId);
  request(
    {
      // API call limit at 200 orders per request
      url: baseurl+'/admin/orders.json?financial_status=paid&limit=200&since_id=' + orderId,
      json: true,
    }, function (error, response, body) {
      //console.log(response.statusCode); //Debug
      // console.log(body.orders); // Debug
      if (error) throw error;
      // If there is no new order found
      if (body.orders.length === 0) {
        console.log("No order received since OrderId: " + orderId);
        return;
      }
      if (!error && response.statusCode === 200 && body.orders.length > 0) {
        // Objects Array for Orders
        var ordersList = [];
        var cart_subtotal_list = [];
        // Nested loop through line_items (ln) and order objects (ord)
        // Outer loop starts
        for (var i = 0; i < body.orders.length; i++) {
          // Variable for cart subtotal loop
          var cart_subtotal_helper = 0;
          // Rename iteration variable to "ord"
          var ord = body.orders[i];
          // Nested loop starts
          for (var j = 0; j < ord.line_items.length; j++) {
            // Declare temporary object to hold values
            var orderObj = {
              documentNo: parseInt(lastDocumentIdStart) + 1, // Update document number by adding 1;
              documentTime: timestring,
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
              discount_codes_code: '',
              discount_codes_type: '',
              discount_codes_amount: '',
              discount_fixed_amount: '',
              total_discounts: '',
              line_items_index: 0,
              line_items: {
                tax_price: '',
                tax_rate: ''
              },
              cart_pricing: {
                regular_price: '',
                cart_price: '',
                cart_subtotal: '',
                cart_discount_percent_rate: '',
                cart_discount_percent_amount: '',
                unit_price: '',
              }
            };
            // Rename iteration variable to "ln"
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
            if (ord.discount_codes[0] != null) { // HARDCODED: ONLY TAKES A SINGLE DISCOUNT CODE PER ORDER
              orderObj.discount_codes_amount = ord.discount_codes[0].amount;
              // IF COUPON IS PERCENT BASED
              if (ord.discount_codes[0].type === "percentage") {
                orderObj.discount_codes_type = "percentage";
                orderObj.discount_codes_code = ord.discount_codes[0].code;
                // COUPON PERCENTAGE IS EXTRACTED FROM COUPON CODE LAST 2 DIGIT (e.g. COUPON10 => 10%)
                orderObj.cart_pricing.cart_discount_percent_rate = parseInt(orderObj.discount_codes_code.trim().slice(-2))/100;
              } else if (ord.discount_codes[0].type === "fixed_amount") {
                orderObj.discount_codes_type = "fixed_amount";
                orderObj.discount_fixed_amount = orderObj.discount_codes_amount;
              }
            }
            orderObj.total_discounts = ord.total_discounts;
            orderObj.line_items_index = j + 1; // 1-based index
            // Assign ln values
            orderObj.line_items.sku = ln.sku;
            orderObj.line_items.qty = ln.quantity;
            orderObj.line_items.price = ln.price;
            orderObj.line_items.recycling_fee = "Test";
            orderObj.line_items.total_discount = ln.total_discount;
            // HARDCODED: ONLY TAKES SINGLE TAX LINE PER LINE ITEM
            if (ln.tax_lines.length > 0) {
              orderObj.line_items.tax_price = ln.tax_lines[0].price
              orderObj.line_items.tax_rate = ln.tax_lines[0].rate
            }
            // Cart price calculation for OMDB
            orderObj.cart_pricing.regular_price = orderObj.line_items.price;
            orderObj.cart_pricing.cart_price = orderObj.line_items.price - (orderObj.line_items.total_discount)/(orderObj.line_items.qty);
            cart_subtotal_helper = cart_subtotal_helper + (orderObj.cart_pricing.cart_price*orderObj.line_items.qty);
            orderObj.cart_pricing.cart_subtotal = cart_subtotal_helper

            // Add assigned object to ordersList array
            ordersList.push(orderObj);
          } // end of loop: line_items

          // Cart subtotal calcuation
          var subtotalObj = {
            order_index: i+1,
            subtotal: cart_subtotal_helper
          }
          cart_subtotal_list.push(subtotalObj);

        } // end of loop: orders

        // Cart subtotal calcuation
        ordersList.forEach(function(order){
          // Callback function for find()
          function findSubtotal(e){
            return e.order_index === order.order_index
          };
          // Return subtotal for the given order index
          order.cart_pricing.cart_subtotal = (cart_subtotal_list.find(findSubtotal).subtotal);
          if (order.discount_codes_type === "percentage") {
            // Discount amount based on percent
            order.cart_pricing.cart_discount_percent_amount = order.cart_pricing.cart_price*(order.cart_pricing.cart_discount_percent_rate);
            // Unit price is the final price sold for each item
            order.cart_pricing.unit_price = order.cart_pricing.cart_price*(1-order.cart_pricing.cart_discount_percent_rate);
          } else {
            // Unit price equals the cart price when there is not percent based discount
            order.cart_pricing.unit_price = order.cart_pricing.cart_price;
          }
        });

        // Update ending lastImportOrderId
        lastImportOrderIdEnd = ordersList[ordersList.length-1].shopifyOrderId;

        // Log summary
        console.log('Ending lastDocumentId: ' + ordersList[ordersList.length-1].documentNo);
        console.log('Ending lastImportOrderId: ' + lastImportOrderIdEnd);
        console.log('Ending PO Number: ' + ordersList[ordersList.length-1].zinus_po);
        console.log('Unqiue Order Count: ' + ordersList[ordersList.length-1].order_index);

        // Convert json objects to csv and write in Incoming
        j2c.json2csv(ordersList, j2cCallbackIncoming);

        // Create order import object for import file
        var importList = [];
        for (var i = 0; i < ordersList.length; i++) {
          var orderImport = ordersList[i]
          var orderImportObjCopy = {};
          orderImportObjCopy.ISACONTROLNO = orderImport.shopifyOrderId;
          orderImportObjCopy.DOCUMENTNO = orderImport.documentNo;
          orderImportObjCopy.ISAID = 'ZINUS.COM';
          orderImportObjCopy.SHIPTO = '';
          orderImportObjCopy.SHPNAME = orderImport.shipping_address_name;
          orderImportObjCopy.SHPADDR1 = orderImport.shipping_address_1;
          orderImportObjCopy.SHPADDR2 = orderImport.shipping_address_2;
          orderImportObjCopy.SHPADDR3 = '';
          orderImportObjCopy.SHPADDR4 = '';
          orderImportObjCopy.SHPCITY = orderImport.shipping_address_city;
          orderImportObjCopy.SHPSTATE = orderImport.shipping_address_state;
          orderImportObjCopy.SHPZIP = orderImport.shipping_address_zip;
          orderImportObjCopy.SHPCOUNTRY = orderImport.shipping_address_country;
          orderImportObjCopy.SHPPHONE = orderImport.shipping_address_phone;
          orderImportObjCopy.SHPEMAIL = orderImport.contact_email;
          orderImportObjCopy.PONUMBER = orderImport.zinus_po;
          orderImportObjCopy.REFERENCE = '';
          orderImportObjCopy.ORDDATE = moment(orderImport.created_at).format("MM/DD/YYYY");
          orderImportObjCopy.TD503 = '';
          orderImportObjCopy.TD505 = '';
          orderImportObjCopy.TD512 = '';
          orderImportObjCopy.EXPDATE = moment(orderImport.created_at).add(5, 'day').format("YYYY/MM/DD");
          orderImportObjCopy.DELVBYDATE = moment(orderImport.created_at).add(10, 'day').format("YYYY/MM/DD");
          orderImportObjCopy.WHCODE = '';
          orderImportObjCopy.STATUS = 0;
          orderImportObjCopy.OPTORD01 = orderImport.order_number;
          orderImportObjCopy.OPTORD02 = orderImport.total_price;
          orderImportObjCopy.OPTORD03 = orderImport.subtotal_price;
          orderImportObjCopy.OPTORD04 = orderImport.total_tax;
          orderImportObjCopy.OPTORD05 = orderImport.discount_codes_type + ": " + orderImport.discount_codes_code;
          orderImportObjCopy.OPTORD06 = orderImport.discount_codes_amount;
          orderImportObjCopy.OPTORD07 = orderImport.discount_fixed_amount;
          orderImportObjCopy.OPTORD08 = orderImport.total_discounts;
          orderImportObjCopy.OPTORD09 = 'FedEx Ground';
          orderImportObjCopy.OPTORD10 = '';
          orderImportObjCopy.OPTORD11 = '';
          orderImportObjCopy.OPTORD12 = '';
          orderImportObjCopy.OPTORD13 = '';
          orderImportObjCopy.OPTORD14 = '';
          orderImportObjCopy.OPTORD15 = '';
          orderImportObjCopy.LINENUM = orderImport.line_items_index;
          orderImportObjCopy.ITEM = orderImport.line_items.sku;
          orderImportObjCopy.QTYORDERED = orderImport.line_items.qty;
          orderImportObjCopy.ORDUNIT = 'ea';
          orderImportObjCopy.UNITPRICE = orderImport.cart_pricing.unit_price;
          orderImportObjCopy.OPTITM01 = orderImport.line_items.tax_price;
          orderImportObjCopy.OPTITM02 = orderImport.line_items.recycling_fee;
          orderImportObjCopy.OPTITM03 = orderImport.cart_pricing.cart_discount_percent_amount;
          orderImportObjCopy.OPTITM04 = orderImport.cart_pricing.cart_price;
          orderImportObjCopy.OPTITM05 = orderImport.cart_pricing.regular_price;
          orderImportObjCopy.OPTITM06 = '';
          orderImportObjCopy.OPTITM07 = '';
          orderImportObjCopy.OPTITM08 = '';
          orderImportObjCopy.OPTITM09 = '';
          orderImportObjCopy.OPTITM10 = '';
          importList.push(orderImportObjCopy);
        }
        // Convert json objects to csv and write in Import
        j2c.json2csv(importList, j2cCallbackImport);
      };
    } // end of request callback
)}; // end of getOrders funciton

recallOrderId();


// Test Git upload
