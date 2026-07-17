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

// מחזירה תאריך ושעה נוכחיים בפורמט קריא, לפי שעון ישראל
function nowFormatted() {
  return new Date().toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
- שלב מדי פעם אימוג'ים חמודים ומתאימים (כמו 😊 🏡 ✨) כדי שהטון יהיה חם ונעים, בלי להגזים - לא בכל משפט.
- הטון שלך אנרגטי, סוחף ומעורר סקרנות אמיתית - גרום ללקוח להרגיש שהוא הגיע למקום הנכון ושכדאי לו להמשיך לשוחח ולהתקדם לפגישת הייעוץ האסטרטגית, כדי לקבל את הערך המלא. עשה זאת רק באמצעות הדגשת ערך אמיתי (מקצועיות, ניסיון, התאמה אישית) - לעולם לא באמצעות דחיפות מזויפת, הבטחות שאינך בטוח בהן, או לחץ שמרגיש לא כן.`,
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
      text: { body: text, preview_url: true },
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
      const now = nowFormatted();
      const existingLead = await findLeadByPhone(from);

      if (!existingLead) {
        // ליד חדש לגמרי - מתחילים את זרימת הסינון
        await createLead(from, { שלב: 'ממתין_לעיר', פנייה_אחרונה: now });
        console.log('נוצר ליד חדש בגיליון, מתחיל שאלון סינון');

        const aiReply = await getAIReply(text);
        await sendReply(from, aiReply);
        await sendReply(from, 'לפני שממשיכים - באיזה עיר נמצא הפרויקט? 🏙️');
        return res.sendStatus(200);
      }

      const stage = existingLead.data.שלב;
      const row = existingLead.rowNumber;

      if (stage === 'ממתין_לעיר') {
        await updateLead(row, { עיר: text, שלב: 'ממתין_למגורים_השקעה', פנייה_אחרונה: now });
        await sendReply(from, 'מעולה! זה פרויקט למגורים או להשקעה? 🏠💰');
      } else if (stage === 'ממתין_למגורים_השקעה') {
        await updateLead(row, { מגורים_או_השקעה: text, שלב: 'ממתין_לקבלן_שיפוץ', פנייה_אחרונה: now });
        await sendReply(from, 'תודה! זה בית מקבלן לפני כניסה, או שמתכננים לשפץ/לתכנן אותו מחדש? 🔨');
      } else if (stage === 'ממתין_לקבלן_שיפוץ') {
        await updateLead(row, { קבלן_או_שיפוץ: text, שלב: 'סינון_הושלם', פנייה_אחרונה: now });
        await sendReply(
          from,
          'קיבלתי את כל הפרטים, תודה! ✨ אני מכין עבורך את החומר המתאים ונחזור אליך בקרוב עם כל הפרטים על ההמשך.'
        );
      } else {
        // ליד ידוע שכבר סיים את הסינון, או במצב לא מוכר - לא ממשיכים למכור אוטומטית
        await updateLead(row, { פנייה_אחרונה: now });
        await sendReply(from, 'היי! קיבלנו את ההודעה שלך ונחזור אליך בהקדם 😊');
        await sendReply(
          process.env.OWNER_PHONE,
          `⚠️ התקבלה הודעה ממספר קיים (${from}):\n"${text}"\n\nכדאי לבדוק את הסטטוס שלו לפני שהבוט ממשיך לדבר איתו.`
        );
      }
    } catch (err) {
      console.log('שגיאה בטיפול בהודעה:', err.message);
    }
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`השרת רץ בהצלחה על http://localhost:${PORT}`);
});
