// מגדיר את כל תוכן סרטוני המעקב, לפי שלב ולפי סוג הליד (קבלן/שיפוץ)

const CHECKLIST_CAPTION = `למה חשוב שמעצב פנים יהיה חלק מהתהליך?

✔ פחות טעויות יקרות
✔ חיסכון בזמן ובכאבי ראש
✔ פתרונות שלא הייתם חושבים עליהם לבד
✔ תכנון מדויק שמנצל את הבית בצורה טובה יותר
✔ התאמה אישית לצרכים שלכם
✔ ליווי ושקט נפשי לאורך כל הדרך
✔ בית שמרגיש יוקרתי, מדויק ונעים יותר לחיות בו

אלו רק חלק מהסיבות שבגללן אנשים בוחרים להיעזר במעצב פנים.

📩 אם אתם מתכננים שיפוץ, מעבר לדירה חדשה או פשוט רוצים להבין מה אפשר לשפר בבית –
נשמח לעזור.`;

const CARPENTRY_CAPTION = '🤩הסוד לנגרות שנראית יוקרתית באמת 🪚';

// content: { type: 'link', url, caption } או { type: 'video', mediaId, caption }
// deltaHours: כמה שעות אחרי השלב הקודם צריך לשלוח את זה
const STEPS = {
  1: {
    deltaHours: 2,
    both: {
      type: 'link',
      url: 'https://www.instagram.com/reel/DDKofqvI52h/?igsh=MWMyY2VtMzQyM2x6bQ==',
      caption: 'למה כל כך חשוב לקבוע איתנו פגישה ברגע שקונים דירה?🪴',
    },
  },
  2: {
    deltaHours: 22, // ביחד עם שלב 1 - 24 שעות = יום מהתחלה
    שיפוץ: { type: 'link', url: 'https://www.instagram.com/reel/DFsBi6IogxR/?igsh=MW42aTRuN3Q2cWk3MQ==', caption: CHECKLIST_CAPTION },
    קבלן: {
      type: 'link',
      url: 'https://www.instagram.com/reel/DO1O042jCRM/?igsh=MWMyZ2hhMjF1MXpzMw==',
      caption: 'בית מקבלן שנראה טוב זה נחמד. בית שמתוכנן נכון זה כבר סיפור אחר🏠👏',
    },
  },
  3: {
    deltaHours: 48, // ביחד עם שלב 2 - 3 ימים מהתחלה
    both: {
      type: 'link',
      url: 'https://www.instagram.com/reel/DMYDOKIIp9o/?igsh=YzgyYWw3cTI0NWZw',
      caption: 'אם חשוב לכם שהבית ירגיש מדויק, שווה צפייה 💫',
    },
  },
  4: {
    deltaHours: 48, // ביחד עם שלב 3 - 5 ימים מהתחלה
    שיפוץ: { type: 'link', url: 'https://www.instagram.com/reel/C7HiBezILiT/?igsh=MWg4c2FscHZya3Vpdg==', caption: CARPENTRY_CAPTION },
    קבלן: {
      type: 'link',
      url: 'https://www.instagram.com/reel/DSVPne6jD05/?igsh=MWRqNHRnZW4ydmY5NA==',
      caption: 'מאחורי כל בית מרשים מקבלן מסתתר תכנון מדויק👌',
    },
  },
  5: {
    deltaHours: 48, // ביחד עם שלב 4 - שבוע מהתחלה (קבלן בלבד)
    קבלן: { type: 'link', url: 'https://www.instagram.com/reel/DFsBi6IogxR/?igsh=MW42aTRuN3Q2cWk3MQ==', caption: CHECKLIST_CAPTION },
  },
  6: {
    deltaHours: 168, // ביחד עם שלב 5 - שבועיים מהתחלה (קבלן בלבד)
    קבלן: { type: 'link', url: 'https://www.instagram.com/reel/C7HiBezILiT/?igsh=MWg4c2FscHZya3Vpdg==', caption: CARPENTRY_CAPTION },
  },
};

// מזהה אם הליד מסוג "קבלן" (לפני שינויי דיירים) לפי הטקסט החופשי שהוא כתב
function detectSegment(קבלן_או_שיפוץ_טקסט) {
  return (קבלן_או_שיפוץ_טקסט || '').includes('קבלן') ? 'קבלן' : 'שיפוץ';
}

function maxStepFor(segment) {
  return segment === 'קבלן' ? 6 : 4;
}

// מחזירה את התוכן שיש לשלוח עבור שלב מסוים ולסגמנט מסוים
function getStepContent(stepNumber, segment) {
  const step = STEPS[stepNumber];
  if (!step) return null;
  return step.both || step[segment] || null;
}

function getDeltaHours(stepNumber) {
  return STEPS[stepNumber]?.deltaHours || null;
}

module.exports = { detectSegment, maxStepFor, getStepContent, getDeltaHours };
