<div align="center">


## 📸 لقطات الشاشة | Screenshots

![Screenshot](screenshot.png)

# ⚔️ معركة الأسئلة | Battle of Questions

### لعبة أسئلة تفاعلية متعددة اللاعبين مع غرف مباشرة وفرق
### Multiplayer quiz battle game with real-time rooms, team modes & live scoring

[![Live Demo](https://img.shields.io/badge/Live-Demo-0a5c5c?style=for-the-badge&logo=vercel&logoColor=white)](https://battle-of-questions.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ziadamr45/Battle-of-Questions)

</div>

---

## 📖 نبذة

<div dir="rtl">

**معركة الأسئلة** هي لعبة أسئلة تفاعلية متعددة اللاعبين تتيح للاعبين التنافس في معارك أسئلة في الوقت الحقيقي. تدعم اللعبة غرف لعب عامة وخاصة، وضع الفرق والتحديات الفردية، مع نظام تسجيل نقاط مباشر ومستويات صعوبة متعددة وأنواع أسئلة متنوعة. التطبيق مبني بتقنيات Next.js و Socket.io لضمان تجربة لعب فورية ومباشرة في جو مليء بالإثارة والمنافسة.

</div>

## ✨ المميزات

| الميزة | الوصف |
|--------|-------|
| ⚔️ معارك أسئلة في الوقت الحقيقي | تنافس مباشر مع لاعبين آخرين |
| 🏠 غرف لعب عامة وخاصة | أنشئ غرفك أو انضم لغرف عامة |
| 👥 وضع الفرق والتحديات الفردية | العب بفريق أو بشكل فردي |
| 📊 نظام تسجيل نقاط مباشر | تتبع النقاط في الوقت الحقيقي |
| 🎯 مستويات صعوبة متعددة | اختبر معلوماتك بمستويات مختلفة |
| 📝 أنواع أسئلة متنوعة | أسئلة متعددة الخيارات وصح/خطأ والمزيد |
| 🔊 مؤثرات صوتية | أصوات تفاعلية تزيد من الإثارة |
| 🐳 دعم Docker للنشر | نشر سهل وسريع عبر Docker |
| 📱 تصميم متجاوب | يعمل على جميع الأجهزة |
| 🌙 وضع داكن/فاتح | اختر المظهر المناسب لك |

## 🎮 أوضاع اللعب

| الوضع | الوصف |
|-------|-------|
| ⚔️ معركة فردية | تنافس 1 ضد 1 في معركة أسئلة مباشرة |
| 👥 معركة فرق | شكّل فريقاً وتنافس ضد فرق أخرى |
| 🏠 غرف عامة | انضم لأي غرفة مفتوحة والعب مع لاعبين جدد |
| 🔒 غرف خاصة | أنشئ غرفة خاصة وألعب مع أصدقائك |

## 🛠️ التقنيات

| التقنية | الاستخدام |
|---------|-----------|
| ![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=next.js&logoColor=white) | إطار العمل الكامل |
| ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) | تطوير آمن بالأنواع |
| ![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat&logo=socket.io&logoColor=white) | اتصال في الوقت الحقيقي |
| ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white) | التصميم |
| ![shadcn/ui](https://img.shields.io/badge/shadcn/ui-000000?style=flat) | مكونات واجهة المستخدم |
| ![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white) | ORM لقاعدة البيانات |
| ![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=flat&logo=framer&logoColor=white) | الحركات والأنيميشن |
| ![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white) | النشر والحاويات |
| ![Railway](https://img.shields.io/badge/Railway-0B0D0E?style=flat&logo=railway&logoColor=white) | استضافة الخادم |

## 🚀 التشغيل

### المتطلبات

- Node.js 18+
- npm أو yarn أو bun
- Docker (اختياري للنشر)

### التثبيت

```bash
# استنساخ المستودع
git clone https://github.com/ziadamr45/Battle-of-Questions.git
cd Battle-of-Questions

# تثبيت التبعيات
npm install
# أو
bun install

# إعداد متغيرات البيئة
cp .env.example .env
# عدّل ملف .env بإعدادات قاعدة البيانات

# تشغيل تهجيرات قاعدة البيانات
npx prisma migrate dev

# تشغيل خادم التطوير
npm run dev
```

التطبيق سيعمل على `http://localhost:3000`

### النشر عبر Docker

```bash
# بناء الصورة
docker build -t battle-of-questions .

# تشغيل الحاوية
docker run -p 3000:3000 --env-file .env battle-of-questions
```

### 📜 الرخصة

هذا المشروع متاح **للعرض والاطلاع فقط**. لا يمكن نسخ الكود أو إعادة إنتاجه أو استخدامه في مشاريع أخرى.

---

### 👨‍💻 المطور

**زياد عمرو (Ziad Amr)**

- 🌐 الموقع الشخصي: [ziadamrme.vercel.app](https://ziadamrme.vercel.app)
- 💼 GitHub: [ziadamr45](https://github.com/ziadamr45)
- 📘 Facebook: [ziad7mr](https://www.facebook.com/ziad7mr)
- 💬 Telegram: [@ziadamr](https://t.me/ziadamr)
- 📸 Instagram: [ziadamr455](https://www.instagram.com/ziadamr455/)
- 🧵 Threads: [@ziadamr455](https://www.threads.com/@ziadamr455)
- 🐦 X: [@ziad90216](https://x.com/ziad90216)
- 🎥 YouTube: [@alhayat_ala_eltarek](https://youtube.com/@alhayat_ala_eltarek?si=pcsc_31Kcv3Jym14)
- 💼 LinkedIn: [ziad-amr](https://www.linkedin.com/in/ziad-amr-44633a411)
- 📧 Email: ziad90216@gmail.com

---

<p align="center">
  مدعوم بواسطة <a href="https://ziadamrme.vercel.app/">زياد عمرو</a>
</p>

---

## English


**Battle of Questions** is a multiplayer interactive quiz game that allows players to compete in real-time quiz battles. The game supports public and private game rooms, team mode and solo challenges, with a live scoring system, multiple difficulty levels, and diverse question types. Built with Next.js and Socket.io for an instant and direct gameplay experience in an atmosphere full of excitement and competition.

### Features

| Feature | Description |
|---------|-------------|
| ⚔️ Real-time quiz battles | Compete directly with other players |
| 🏠 Public & private game rooms | Create your room or join public ones |
| 👥 Team mode & solo challenges | Play as a team or individually |
| 📊 Live scoring system | Track scores in real-time |
| 🎯 Multiple difficulty levels | Test your knowledge at different levels |
| 📝 Diverse question types | Multiple choice, true/false, and more |
| 🔊 Sound effects | Interactive sounds that add excitement |
| 🐳 Docker support for deployment | Easy and fast deployment via Docker |
| 📱 Responsive design | Works on all devices |
| 🌙 Dark/Light mode | Choose your preferred theme |

### Game Modes

| Mode | Description |
|------|-------------|
| ⚔️ Solo Battle | Compete 1v1 in a live quiz battle |
| 👥 Team Battle | Form a team and compete against other teams |
| 🏠 Public Rooms | Join any open room and play with new players |
| 🔒 Private Rooms | Create a private room and play with friends |

### Tech Stack

| Technology | Purpose |
|------------|---------|
| ![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=next.js&logoColor=white) | Fullstack Framework |
| ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) | Type-safe Development |
| ![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat&logo=socket.io&logoColor=white) | Real-time Communication |
| ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white) | Styling |
| ![shadcn/ui](https://img.shields.io/badge/shadcn/ui-000000?style=flat) | UI Components |
| ![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white) | Database ORM |
| ![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=flat&logo=framer&logoColor=white) | Animations |
| ![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white) | Deployment & Containers |
| ![Railway](https://img.shields.io/badge/Railway-0B0D0E?style=flat&logo=railway&logoColor=white) | Server Hosting |

### Getting Started

#### Prerequisites

- Node.js 18+ or Bun
- npm, yarn, or bun
- Docker (optional for deployment)

#### Installation

```bash
# Clone the repository
git clone https://github.com/ziadamr45/Battle-of-Questions.git
cd Battle-of-Questions

# Install dependencies
npm install
# or
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your database configuration

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000`

#### Docker Deployment

```bash
# Build the image
docker build -t battle-of-questions .

# Run the container
docker run -p 3000:3000 --env-file .env battle-of-questions
```

### License

This project is available for **viewing and reference only**. The code cannot be copied, reproduced, or used in other projects.

---

### 👨‍💻 Developer

**Ziad Amr**

- 🌐 Portfolio: [ziadamrme.vercel.app](https://ziadamrme.vercel.app)
- 💼 GitHub: [ziadamr45](https://github.com/ziadamr45)
- 📘 Facebook: [ziad7mr](https://www.facebook.com/ziad7mr)
- 💬 Telegram: [@ziadamr](https://t.me/ziadamr)
- 📸 Instagram: [ziadamr455](https://www.instagram.com/ziadamr455/)
- 🧵 Threads: [@ziadamr455](https://www.threads.com/@ziadamr455)
- 🐦 X: [@ziad90216](https://x.com/ziad90216)
- 🎥 YouTube: [@alhayat_ala_eltarek](https://youtube.com/@alhayat_ala_eltarek?si=pcsc_31Kcv3Jym14)
- 💼 LinkedIn: [ziad-amr](https://www.linkedin.com/in/ziad-amr-44633a411)
- 📧 Email: ziad90216@gmail.com

---

<p align="center">
  Powered by <a href="https://ziadamrme.vercel.app/">Ziad Amr</a>
</p>
