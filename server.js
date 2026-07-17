require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const { findLeadByPhone, createLead, updateLead } = require('./sheets');

// רשת ביטחון - מונעת קריסה מלאה של השרת אם משהו נכשל בלי טיפול
process.on('uncaughtException', (err) => console.log('שגיאה לא מטופלת:', err));
process.on('unhandledRejection', (err) => console.log('דחייה לא מטופלת:', err));

const app = express();
const PORT = 3000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.json());

// שולחת את הודעת הלקוח ל-OpenAI ומקבלת בחזרה תשובה חכמה
async function getAIReply(customerText) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `אתה נציג שירות לקוחות של מאור ברקת עיצוב ותכנון, עסק בתחום עיצוב ותכנון. אתה עונה ללקוחות בוואטסאפ.

כללים שחובה לשמור עליהם:
- ענה בעברית, בקצרה, באדיבות ובמקצועיות.
- כתוב את שם העסק "מאור ברקת עיצוב ותכנון" ואת השם "מאור" תמיד בדיוק כך, בלי גרשיים ובלי מרכאות באמצע המילים.
- דבר רק על נושאים שקשורים לעסק (עיצוב, תכנון, שירותי החברה). אם נשאלת על נושא לא קשור, הסבר בנימוס שאתה יכול לעזור רק בנושאים הקשורים לעסק.
- אסור לך להמציא מידע שאינך בטוח בו — לא מחירים, לא תאריכים, לא זמינות, ולא פרטים על העסק שלא נמסרו לך. אם אינך יודע תשובה מדויקת, אמור זאת בכנות והצע שנציג אנושי יחזור עם התשובה המדויקת.
- אל תתחייב בשם העסק להנחות, הטבות, מועדים או התחייבויות כלשהן — לכך נדרש אישור אדם מהצוות.
- שלב מדי פעם אימוג'ים חמודים ומתאימים (כמו 😊 🏡 ✨) כדי שהטון יהיה חם ונעים, בלי להגזים - לא בכל משפט.`,
      },
      { role: 'user', content: customerText },
    ],
  });

  return completion.choices[0].message.content;
}

app.get('/', (req, res) => {
  res.send('השרת של הבוט עובד!');
});

// Meta שולחת בקשת GET לכתובת הזו כדי לאמת שהשרת שלנו הוא באמת שלנו
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('האימות מול Meta הצליח!');
    res.status(200).send(challenge);
  } else {
    console.log('האימות נכשל - מילת הסיסמה לא תואמת');
    res.sendStatus(403);
  }
});

// פונקציה ששולחת הודעת טקסט חזרה ללקוח דרך ה-API של Meta
async function sendReply(to, text) {
  const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  const data = await response.json();
  console.log('תשובת שליחה מ-Meta:', JSON.stringify(data));
}

// Meta שולחת בקשת POST לכתובת הזו בכל פעם שמגיעה הודעה חדשה מלקוח
app.post('/webhook', async (req, res) => {
  const entry = req.body.entry?.[0];
  const change = entry?.changes?.[0];
  const message = change?.value?.messages?.[0];

  if (message) {
    const from = message.from;
    const text = message.text?.body;
    console.log(`התקבלה הודעה חדשה ממספר ${from}: "${text}"`);

    try {
      const now = new Date().toISOString();
      const existingLead = await findLeadByPhone(from);

      if (existingLead) {
        await updateLead(existingLead.rowNumber, { פנייה_אחרונה: now });
        console.log(`עודכן ליד קיים בשורה ${existingLead.rowNumber}`);
      } else {
        await createLead(from, { שלב: 'חדש', פנייה_אחרונה: now });
        console.log('נוצר ליד חדש בגיליון');
      }
    } catch (err) {
      console.log('שגיאה בעדכון הגיליון:', err.message);
    }

    const aiReply = await getAIReply(text);
    await sendReply(from, aiReply);
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`השרת רץ בהצלחה על http://localhost:${PORT}`);
});
