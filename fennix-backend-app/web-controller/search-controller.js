const searchBusiness = require('../business-module/search-business-module/search-business');
var express = require('express');
var router = express.Router();

router.get('/search', (req, res) => {
    let returnObj;
    returnObj = searchBusiness.searchBusiness(req);
    returnObj.then((response) => {
        res.send(response);
    })
});