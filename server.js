const express = require('express');
const cors = require('cors');
const { createOpenAI } = require('@ai-sdk/openai');
const { generateText } = require('ai');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ====== تنظیمات سرویس AI لیارا ======
const openai = createOpenAI({
  baseURL: process.env.BASE_URL, // از متغیر محیطی خوانده می‌شود
  apiKey: process.env.LIARA_API_KEY, // از متغیر محیطی خوانده می‌شود
});

// ====== داده‌های نمونه (برای جستجوی O*NET) ======
const mockOccupations = {
    "11-2022.00": {
        title: "مدیر منابع انسانی",
        duties: [
            "برنامه‌ریزی و اجرای سیاست‌های منابع انسانی",
            "مدیریت فرآیند جذب و استخدام",
            "طراحی سیستم‌های ارزیابی عملکرد",
            "هماهنگی آموزش کارکنان",
            "مدیریت روابط کار و حل اختلافات"
        ]
    },
    "15-1132.00": {
        title: "توسعه‌دهنده نرم‌افزار",
        duties: [
            "تحلیل نیازمندی‌ها و طراحی نرم‌افزار",
            "کدنویسی و توسعه برنامه‌ها",
            "تست و رفع اشکال",
            "مستندسازی کدها",
            "همکاری با تیم محصول"
        ]
    },
    "13-1151.00": {
        title: "کارشناس آموزش",
        duties: [
            "شناسایی نیازهای آموزشی",
            "طراحی و اجرای دوره‌ها",
            "ارزیابی اثربخشی آموزش",
            "هماهنگی با مربیان",
            "مدیریت بودجه آموزش"
        ]
    }
};

// ====== مسیر جستجوی عنوان شغل ======
app.get('/api/search', (req, res) => {
    const keyword = req.query.keyword;
    if (!keyword) return res.status(400).json({ error: 'کلمه کلیدی وارد کنید' });
    const results = Object.entries(mockOccupations)
        .filter(([code, job]) => job.title.includes(keyword))
        .map(([code, job]) => ({ code, title: job.title }));
    res.json(results);
});

// ====== مسیر دریافت اطلاعات کامل شغل با کد ======
app.get('/api/onet/:code', (req, res) => {
    const code = req.params.code;
    const job = mockOccupations[code];
    if (!job) return res.status(404).json({ error: 'کد یافت نشد' });
    res.json(job);
});

// ====== مسیر تحلیل با هوش مصنوعی (با مدل Qwen) ======
app.post('/api/analyze-with-ai', async (req, res) => {
    try {
        const { duties, industry, jobLevel } = req.body;
        
        if (!duties || !Array.isArray(duties)) {
            return res.status(400).json({ error: 'وظایف باید آرایه باشند' });
        }

        // آماده‌سازی متن وظایف
        const dutiesText = duties.map((d, i) => `${i+1}. ${d}`).join('\n');
        
        // ساختن prompt مناسب برای تحلیل شایستگی‌ها
        const prompt = `
        شما یک متخصص تحلیل شغل در صنعت خودروسازی هستید.
        
        اطلاعات شغل:
        - حوزه تخصصی: ${industry || 'عمومی'}
        - سطح سازمانی: ${jobLevel || 'نامشخص'}
        
        وظایف شغلی:
        ${dutiesText}
        
        لطفاً بر اساس وظایف فوق، شایستگی‌های کلیدی (حداکثر ۱۰ مورد) را که برای این شغل ضروری هستند، استخراج کنید.
        
        شایستگی‌ها باید:
        1. مرتبط با صنعت خودروسازی باشند
        2. قابل اندازه‌گیری و مشخص باشند
        3. ترکیبی از مهارت‌های فنی و نرم باشند
        
        خروجی را فقط به صورت یک آرایه JSON از رشته‌ها برگردان. مثال: ["مدیریت تولید ناب", "کنترل کیفیت آماری", ...]
        `;

        // ارسال به سرویس AI لیارا با مدل Qwen
        const { text } = await generateText({
            model: openai('Qwen3 235B A22B Thinking 2507'), // نام دقیق مدل را از پنل لیارا ببینید
            prompt: prompt,
            temperature: 0.3,
            maxTokens: 500,
        });

        // پردازش پاسخ
        let competencies;
        try {
            // تلاش برای استخراج آرایه JSON از پاسخ
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                competencies = JSON.parse(jsonMatch[0]);
            } else {
                // اگر JSON یافت نشد، خط‌ها را به عنوان آرایه در نظر بگیر
                competencies = text.split('\n')
                    .filter(line => line.trim() && !line.includes('json') && !line.includes('```'))
                    .map(line => line.replace(/^\d+\.\s*/, '').trim());
            }
        } catch (e) {
            console.error('خطا در پردازش JSON:', e);
            competencies = [text]; // بازگشت کل متن به عنوان یک شایستگی
        }

        res.json({ competencies });
    } catch (error) {
        console.error('خطا در ارتباط با AI:', error);
        res.status(500).json({ error: 'خطا در تحلیل با هوش مصنوعی' });
    }
});

// ====== راه‌اندازی سرور ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 سرور شایدا در پورت ${PORT} اجرا شد`);
    console.log(`🤖 سرویس AI لیارا با مدل Qwen متصل است`);
});
