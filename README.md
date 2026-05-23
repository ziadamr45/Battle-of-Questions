<div align="center">

# ⚔️ معركة الأسئلة | Battle of Questions

### لعبة أسئلة تفاعلية متعددة اللاعبين مع غرف مباشرة وفرق
### Multiplayer quiz battle game with real-time rooms, team modes & live scoring

[![Live Demo](https://img.shields.io/badge/Live-Demo-0a5c5c?style=for-the-badge&logo=vercel&logoColor=white)](https://motaharrer.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ziadamr45/Battle-of-Questions)

</div>

---

## 📖 نبذة | Overview

<div dir="rtl">

**معركة الأسئلة** هي لعبة ويب تفاعلية تتيح للاعبين التنافس في معارك أسئلة في الوقت الحقيقي. يمكن إنشاء غرف لعب خاصة أو عامة، والدخول في تحديات فردية أو جماعية، مع نظام تسجيل نقاط مباشر ومجموعة متنوعة من أنواع الأسئلة ومستويات الصعوبة.

اللعبة تدعم Socket.io للاتصال الفوري، وتشمل أوضاع لعب متعددة مثل التحدي الفردي، معارك الفرق، وأوضاع مخصصة.

</div>

**Battle of Questions** is an interactive web game that allows players to compete in real-time quiz battles. Players can create private or public game rooms, engage in individual or team challenges, with live scoring and a diverse range of question types and difficulty levels.

The game uses Socket.io for real-time communication and includes multiple game modes such as solo challenges, team battles, and custom modes.

---

## ✨ المميزات | Features

| الميزة | Feature |
|--------|---------|
| ⚔️ معارك أسئلة في الوقت الحقيقي | Real-time quiz battles |
| 🏠 غرف لعب عامة وخاصة | Public & private game rooms |
| 👥 وضع الفرق والتحديات الفردية | Team mode & solo challenges |
| 📊 نظام تسجيل نقاط مباشر | Live scoring system |
| 🎯 مستويات صعوبة متعددة | Multiple difficulty levels |
| 📝 أنواع أسئلة متنوعة | Diverse question types |
| 🔊 مؤثرات صوتية | Sound effects & audio engine |
| 🐳 دعم Docker للنشر | Docker support for deployment |
| 📱 تصميم متجاوب | Responsive design |
| 🌙 وضع داكن/فاتح | Dark/Light mode |

---

## 🛠️ التقنيات | Tech Stack

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

---

## 🚀 التشغيل | Getting Started

### المتطلبات | Prerequisites

- Node.js 18+ or Bun
- npm, yarn, or bun
- Docker (optional, for containerized deployment)

### التثبيت | Installation

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

### Docker Deployment

```bash
# Build and run with Docker
docker build -t battle-of-questions .
docker run -p 3000:3000 battle-of-questions

# Or use the start script
./start-all.sh
```

The app will be available at `http://localhost:3000`

---

## 🎮 أوضاع اللعب | Game Modes

| الوضع | Mode | Description |
|-------|------|-------------|
| 🗡️ تحدي فردي | Solo Challenge | 1v1 quiz battle |
| ⚔️ معركة فرق | Team Battle | Team vs team competition |
| 🎯 مخصص | Custom | Customizable game settings |
| 📖 مراجعة الإجابات | Answer Review | Review correct answers after game |

---

<div align="center">

Made with ❤️ by [Ziad Amr](https://github.com/ziadamr45)

</div>
