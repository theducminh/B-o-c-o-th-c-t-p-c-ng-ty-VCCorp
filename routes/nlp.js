const express = require('express');
const route = express.Router();
const nlpController = require('../controllers/nlpController');

route.post('/', nlpController.handleQuery);

module.exports = route;
