<div align="center">


## 📸 لقطات الشاشة | Screenshots

![Screenshot](public/logo-new.png)

# ⚔️ معركة الأسئلة | Battle of Questions

### لعبة أسئلة تفاعلية متعددة اللاعبين مع غرف مباشرة وفرق
### Multiplayer quiz battle game with real-time rooms, team modes & live scoring

[![Live Demo](https://img.shields.io/badge/Live-Demo-0a5c5c?style=for-the-badge&logo=vercel&logoColor=white)](https://motaharrer.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ziadamr45/Battle-of-Questions)

</div>

---

## 📖 نبذة

<div dir="rtl">

**معركة الأسئلة** هي لعبة ويب تفاعلية تتيح للاعبين التنافس في معارك أسئلة في الوقت الحقيقي. يمكن إنشاء غرف لعب خاصة أو عامة، والدخول في تحديات فردية أو جماعية، مع نظام تسجيل نقاط مباشر ومجموعة متنوعة من أنواع الأسئلة ومستويات الصعوبة.

اللعبة تدعم Socket.io للاتصال الفوري، وتشمل أوضاع لعب متعددة مثل التحدي الفردي، معارك الفرق، وأوضاع مخصصة.

</div>

## ✨ المميزات

| الميزة | الوصف |
|--------|-------|
| ⚔️ معارك أسئلة في الوقت الحقيقي | تنافس مع لاعبين آخرين مباشرة |
| 🏠 غرف لعب عامة وخاصة | أنشئ أو انضم لغرف اللعب |
| 👥 وضع الفرق والتحديات الفردية | تحديات 1 ضد 1 أو فرق ضد فرق |
| 📊 نظام تسجيل نقاط مباشر | تابع نقاطك في الوقت الحقيقي |
| 🎯 مستويات صعوبة متعددة | سهل، متوسط، وصعب |
| 📝 أنواع أسئلة متنوعة | اختيار من متعدد، صح/خطأ، والمزيد |
| 🔊 مؤثرات صوتية | أصوت وتأثيرات تفاعلية |
| 🐳 دعم Docker للنشر | نشر سهل باستخدام الحاويات |
| 📱 تصميم متجاوب | يعمل على جميع الأجهزة |
| 🌙 وضع داكن/فاتح | اختر المظهر المناسب لك |

## 🛠️ التقنيات

| التقنية | الاستخدام |
|---------|-----------|
| ![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=next.js&logoColor=white) | إطار العمل الكامل |
| ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) | تطوير آمن بالأنواع |
| ![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat&logo=socket.io&logoColor=white) | الاتصال الفوري |
| ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white) | التصميم |
| ![shadcn/ui](https://img.shields.io/badge/shadcn/ui-000000?style=flat) | مكونات واجهة المستخدم |
| ![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white) | ORM لقاعدة البيانات |
| ![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=flat&logo=framer&logoColor=white) | الحركات والأنيميشن |
| ![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white) | الحاويات |
| ![Railway](https://img.shields.io/badge/Railway-0B0D0E?style=flat&logo=railway&logoColor=white) | النشر والاستضافة |

## 🚀 التشغيل

### المتطلبات

- Node.js 18+ أو Bun
- npm أو yarn أو bun
- Docker (اختياري، للنشر بالحاويات)

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
# عدّل ملف .env بالإعدادات الخاصة بك

# تشغيل تهجيرات قاعدة البيانات
npx prisma migrate dev

# تشغيل خادم التطوير
npm run dev
```

### النشر باستخدام Docker

```bash
# بناء وتشغيل باستخدام Docker
docker build -t battle-of-questions .
docker run -p 3000:3000 battle-of-questions

# أو استخدم سكربت التشغيل
./start-all.sh
```

التطبيق سيعمل على `http://localhost:3000`

## 🎮 أوضاع اللعب

| الوضع | الوصف |
|-------|-------|
| 🗡️ تحدي فردي | معركة أسئلة 1 ضد 1 |
| ⚔️ معركة فرق | منافسة فريق ضد فريق |
| 🎯 مخصص | إعدادات لعب قابلة للتخصيص |
| 📖 مراجعة الإجابات | مراجعة الإجابات الصحيحة بعد اللعبة |

---

<div align="center">

Ziad Amr

</div>

---

### 📜 الرخصة

هذا المشروع متاح **للعرض والاطلاع فقط**. لا يمكن نسخ الكود أو إعادة إنتاجه أو استخدامه في مشاريع أخرى. راجع [LICENSE.md](./LICENSE.md) للتفاصيل الكاملة.

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

## English


**Battle of Questions** is an interactive web game that allows players to compete in real-time quiz battles. Players can create private or public game rooms, engage in individual or team challenges, with live scoring and a diverse range of question types and difficulty levels.

The game uses Socket.io for real-time communication and includes multiple game modes such as solo challenges, team battles, and custom modes.

### Features

| Feature | Description |
|---------|-------------|
| ⚔️ Real-time quiz battles | Compete with other players live |
| 🏠 Public & private game rooms | Create or join game rooms |
| 👥 Team mode & solo challenges | 1v1 or team vs team challenges |
| 📊 Live scoring system | Track your score in real time |
| 🎯 Multiple difficulty levels | Easy, medium, and hard |
| 📝 Diverse question types | Multiple choice, true/false, and more |
| 🔊 Sound effects | Interactive audio and effects |
| 🐳 Docker support for deployment | Easy containerized deployment |
| 📱 Responsive design | Works on all devices |
| 🌙 Dark/Light mode | Choose your preferred theme |

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
| ![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white) | Containerization |
| ![Railway](https://img.shields.io/badge/Railway-0B0D0E?style=flat&logo=railway&logoColor=white) | Deployment |

### Getting Started

#### Prerequisites

- Node.js 18+ or Bun
- npm, yarn, or bun
- Docker (optional, for containerized deployment)

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
# Edit .env with your configuration

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

#### Docker Deployment

```bash
# Build and run with Docker
docker build -t battle-of-questions .
docker run -p 3000:3000 battle-of-questions

# Or use the start script
./start-all.sh
```

The app will be available at `http://localhost:3000`

### Game Modes

| Mode | Description |
|------|-------------|
| 🗡️ Solo Challenge | 1v1 quiz battle |
| ⚔️ Team Battle | Team vs team competition |
| 🎯 Custom | Customizable game settings |
| 📖 Answer Review | Review correct answers after game |

---

<div align="center">

Ziad Amr

</div>

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

### ⚠️ Source Available License

This project is available for **viewing and reference only**. The code cannot be copied, reproduced, or used in other projects. See [LICENSE.md](./LICENSE.md) for full details.
