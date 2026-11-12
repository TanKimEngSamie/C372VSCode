const mysql = require('mysql2');

// MySQL Connection
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Kimanh@@1901',
  database: 'petcare'
});

module.exports = connection;
