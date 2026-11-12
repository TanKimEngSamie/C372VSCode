const connection = require('../config/db');

function rollbackTransaction(connectionRef, callback) {
  connectionRef.rollback(() => callback());
}

function createPendingBooking(ownerId, petId, serviceId, bookingDate, callback) {
  connection.beginTransaction((beginErr) => {
    if (beginErr) {
      return callback(beginErr);
    }

    const petCheckSql = 'SELECT id FROM pets WHERE id = ? AND owner_id = ?';
    connection.query(petCheckSql, [petId, ownerId], (petErr, petRows) => {
      if (petErr) {
        return rollbackTransaction(connection, () => callback(petErr));
      }

      if (!petRows || petRows.length === 0) {
        return rollbackTransaction(connection, () => callback(null, null));
      }

      const serviceCheckSql = 'SELECT id, price FROM services WHERE id = ? AND is_active = 1';
      connection.query(serviceCheckSql, [serviceId], (serviceErr, serviceRows) => {
        if (serviceErr) {
          return rollbackTransaction(connection, () => callback(serviceErr));
        }

        if (!serviceRows || serviceRows.length === 0) {
          return rollbackTransaction(connection, () => callback(null, null));
        }

        const service = serviceRows[0];
        const bookingSql = `
          INSERT INTO service_bookings
            (pet_id, service_id, booking_status, booked_price, booking_date)
          VALUES (?, ?, 'pending', ?, ?)
        `;

        connection.query(bookingSql, [petId, serviceId, service.price, bookingDate], (bookingErr, bookingResult) => {
          if (bookingErr) {
            return rollbackTransaction(connection, () => callback(bookingErr));
          }

          const bookingId = bookingResult && bookingResult.insertId;
          if (!bookingId) {
            return rollbackTransaction(connection, () => callback(new Error('Failed to create booking')));
          }

          const paymentSql = `
            INSERT INTO payments
              (booking_id, amount, payment_status, payment_reference)
            VALUES (?, ?, 'pending', NULL)
          `;

          connection.query(paymentSql, [bookingId, service.price], (paymentErr, paymentResult) => {
            if (paymentErr) {
              return rollbackTransaction(connection, () => callback(paymentErr));
            }

            const paymentId = paymentResult && paymentResult.insertId;
            if (!paymentId) {
              return rollbackTransaction(connection, () => callback(new Error('Failed to create payment')));
            }

            connection.commit((commitErr) => {
              if (commitErr) {
                return rollbackTransaction(connection, () => callback(commitErr));
              }

              callback(null, { bookingId, paymentId });
            });
          });
        });
      });
    });
  });
}

function getBookingsByOwner(ownerId, callback) {
  const sql = `
    SELECT
      sb.id AS booking_id,
      sb.booking_date,
      p.name AS pet_name,
      s.name AS service_name,
      sb.booked_price,
      sb.booking_status,
      pay.payment_status
    FROM service_bookings AS sb
    JOIN pets AS p ON p.id = sb.pet_id
    JOIN services AS s ON s.id = sb.service_id
    LEFT JOIN payments AS pay ON pay.booking_id = sb.id
    WHERE p.owner_id = ?
    ORDER BY sb.created_at DESC, sb.id DESC
  `;

  connection.query(sql, [ownerId], callback);
}

module.exports = {
  createPendingBooking,
  getBookingsByOwner
};
