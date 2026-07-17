require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const { findLeadByPhone, createLead, updateLead, getAllLeads } = require('./sheets');
const { detectSegment, maxStepFor, getStepContent, getDeltaHours } = require('./followups');

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
- הטון שלך אנרגטי, סוחף ומעורר סקרנות אמיתית - גרום ללקוח להרגיש שהוא הגיע למקום הנכון ושכדאי לו להמשיך לשוחח ולהתקדם לפגישת הייעוץ האסטרטגית, כדי לקבל את הערך המלא. עשה זאת רק באמצעות הדגשת ערך אמיתי (מקצועיות, ניסיון, התאמה אישית) - לעולם לא באמצעות דחיפות מזויפת, הבטחות שאינך בטוח בהן, או לחץ שמרגיש לא כן.
- אינך יודע אם אתה פונה לגבר או לאישה. לכן פנה בגוף שני בלי לציין במפורש "אתה" או "את" או "אתם", והשתמש במילים שכתובות זהה בזכר ובנקבה (כמו "רוצה", "אותך", "לך") כדי שהפנייה תרגיש אישית ומדויקת לכל אחד.`,
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

// פונקציה ששולחת סרטון (קובץ שהועלה מראש ל-Meta, לפי מזהה) עם כיתוב
async function sendVideo(to, mediaId, caption) {
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
      type: 'video',
      video: { id: mediaId, caption },
    }),
  });

  const data = await response.json();
  console.log('תשובת שליחת וידאו מ-Meta:', JSON.stringify(data));
}

// שולחת תוכן של שלב מעקב (קישור או סרטון) ללקוח
async function sendStepContent(to, content) {
  if (!content) return;
  if (content.type === 'video') {
    await sendVideo(to, content.mediaId, content.caption);
  } else {
    await sendReply(to, `${content.caption}\n${content.url}`);
  }
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
        const step1Due = new Date(Date.now() + getDeltaHours(1) * 60 * 60 * 1000).toISOString();
        await updateLead(row, {
          קבלן_או_שיפוץ: text,
          שלב: 'סינון_הושלם',
          פנייה_אחרונה: now,
          שלב_מעקב: '0',
          מעקב_הבא: step1Due,
        });
        await sendReply(from, 'קיבלתי את כל הפרטים, תודה! ✨ הנה סרטון קצר שמסביר בדיוק על מה מדובר בפגישת הייעוץ:');
        await sendVideo(from, process.env.MEETING_VIDEO_MEDIA_ID, 'פגישת הייעוץ האסטרטגית - מה מחכה לך 👇');
      } else if (stage === 'ממתין_לתשובת_סקרנות') {
        const segment = detectSegment(existingLead.data.קבלן_או_שיפוץ);
        const wantsMore = text.includes('כן');

        if (wantsMore) {
          const content = getStepContent(3, segment);
          await sendStepContent(from, content);
          // מעקב_הבא כבר מכיל את המועד המתוכנן המקורי לשלב 3 - נשתמש בו כבסיס לחישוב שלב 4
          const nextDue = new Date(
            new Date(existingLead.data.מעקב_הבא).getTime() + getDeltaHours(4) * 60 * 60 * 1000
          ).toISOString();
          await updateLead(row, { שלב: 'סינון_הושלם', שלב_מעקב: '3', מעקב_הבא: nextDue, פנייה_אחרונה: now });
        } else {
          await sendReply(from, 'בסדר גמור, נמשיך בקרוב עם עוד תוכן שיעניין אותך 😊');
          await updateLead(row, { שלב: 'סינון_הושלם', פנייה_אחרונה: now });
        }
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

// נקודת קצה שה"שעון" החיצוני קורא לה כל כמה דקות, כדי לבדוק ולשלוח סרטוני מעקב שהגיע זמנם
app.get('/run-followups', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) {
    return res.sendStatus(403);
  }

  try {
    const leads = await getAllLeads();
    const now = Date.now();
    let sentCount = 0;

    for (const lead of leads) {
      if (lead.data.שלב !== 'סינון_הושלם') continue;
      if (!lead.data.מעקב_הבא) continue;

      const dueTime = new Date(lead.data.מעקב_הבא).getTime();
      if (isNaN(dueTime) || now < dueTime) continue;

      const segment = detectSegment(lead.data.קבלן_או_שיפוץ);
      const currentStep = parseInt(lead.data.שלב_מעקב || '0', 10);
      const nextStep = currentStep + 1;

      if (nextStep > maxStepFor(segment)) continue;

      const content = getStepContent(nextStep, segment);
      await sendStepContent(lead.data.טלפון, content);
      sentCount++;

      const updates = { שלב_מעקב: String(nextStep) };

      if (nextStep === 2) {
        await sendReply(lead.data.טלפון, 'רוצה לראות עוד משהו מעניין? 👀');
        updates.שלב = 'ממתין_לתשובת_סקרנות';
      }

      const nextDelta = getDeltaHours(nextStep + 1);
      if (nextDelta) {
        updates.מעקב_הבא = new Date(dueTime + nextDelta * 60 * 60 * 1000).toISOString();
      } else {
        updates.מעקב_הבא = '';
      }

      await updateLead(lead.rowNumber, updates);
      console.log(`נשלח שלב מעקב ${nextStep} ל-${lead.data.טלפון}`);
    }

    res.send(`בוצע. נשלחו ${sentCount} הודעות מעקב.`);
  } catch (err) {
    console.log('שגיאה בהרצת המעקבים:', err.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`השרת רץ בהצלחה על http://localhost:${PORT}`);
});
