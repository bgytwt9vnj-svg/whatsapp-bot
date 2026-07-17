const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'גיליון1';

// סדר העמודות בגיליון - חייב להתאים בדיוק לכותרות בשורה הראשונה
const COLUMNS = [
  'טלפון',
  'שם',
  'שלב',
  'עיר',
  'מגורים_או_השקעה',
  'קבלן_או_שיפוץ',
  'פנייה_אחרונה',
  'שלב_מעקב',
  'מעקב_הבא',
  'שעה_מבוקשת',
  'סטטוס_פגישה',
  'הערות',
];

function getAuthClient() {
  return new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'google-credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheetsClient() {
  const auth = getAuthClient();
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

// מחפשת ליד לפי מספר טלפון ומחזירה את השורה שלו (או null אם לא נמצא)
async function findLeadByPhone(phone) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:L`,
  });

  const rows = res.data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === phone) {
      const data = {};
      COLUMNS.forEach((col, idx) => {
        data[col] = rows[i][idx] || '';
      });
      return { rowNumber: i + 1, data };
    }
  }
  return null;
}

// יוצרת שורת ליד חדשה בסוף הגיליון
async function createLead(phone, fields = {}) {
  const sheets = await getSheetsClient();
  const row = COLUMNS.map((col) => (col === 'טלפון' ? phone : fields[col] || ''));

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:L`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
}

// מחזירה את כל הלידים בגיליון, עם מספר השורה של כל אחד
async function getAllLeads() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:L`,
  });

  const rows = res.data.values || [];
  const leads = [];
  for (let i = 1; i < rows.length; i++) {
    const data = {};
    COLUMNS.forEach((col, idx) => {
      data[col] = rows[i][idx] || '';
    });
    leads.push({ rowNumber: i + 1, data });
  }
  return leads;
}

// מעדכנת שדות ספציפיים בשורה קיימת (rowNumber מבוסס-1, כמו בגיליון)
async function updateLead(rowNumber, fields) {
  const sheets = await getSheetsClient();

  const updates = Object.entries(fields).map(([col, value]) => {
    const colIndex = COLUMNS.indexOf(col);
    const colLetter = String.fromCharCode('A'.charCodeAt(0) + colIndex);
    return {
      range: `${SHEET_NAME}!${colLetter}${rowNumber}`,
      values: [[value]],
    };
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
  });
}

module.exports = { findLeadByPhone, createLead, updateLead, getAllLeads, COLUMNS };
