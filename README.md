<p align="center">
  <img src="public/datablaze_logo_black_bg.svg" alt="Datablaze Logo" width="120" height="120">
</p>

<h1 align="center">Datablaze</h1>

<p align="center">
  <strong>⚡ A Modern, Lightning-Fast Database Manager</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#development">Development</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.0-blue?style=flat-square&logo=tauri" alt="Tauri">
  <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/Rust-1.70+-orange?style=flat-square&logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
</p>

---

## ✨ Features

### 🔌 **Multi-Database Support**
- **PostgreSQL** - Full support with schema browsing
- **MySQL** - Complete compatibility with all MySQL features
- **SQLite** - Lightweight file-based database support
- Easy connection management with saved credentials

### 🎨 **Beautiful Interface**
- Modern, sleek dark and light themes
- Custom frameless window with native controls
- Responsive sidebar with table tree explorer
- Monaco-powered SQL editor with syntax highlighting

### ⚡ **Performance First**
- Built with Rust backend for maximum speed
- Streaming query results for large datasets
- Smart result truncation (2000 row limit) to prevent UI freezes
- Lazy loading for Base64 images

### 🛠️ **Developer Experience**
- Multi-tab query support
- Save and organize your frequently used queries
- One-click table data preview
- JSON/Card/Table view modes for results
- Copy results as CSV or JSON
- Foreign key navigation with sidebar drill-down

### 🔒 **Security**
- Local-first: your data never leaves your machine
- Optional password storage
- No telemetry or tracking

---

## 📥 Installation

### Pre-built Binaries

Download the latest release for your platform:

| Platform | Download |
|----------|----------|
| Windows  | [📦 Datablaze_0.1.0_x64_en-US.msi](https://github.com/HaroldXd/Datablaze/releases/download/v0.1.0/Datablaze_0.1.0_x64_en-US.msi) |
| macOS    | Coming soon |
| Linux    | Coming soon |

### Build from Source

```bash
# Clone the repository
git clone https://github.com/HaroldXd/Datablaze.git
cd datablaze

# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

---

## 🚀 Usage

### Connecting to a Database

1. Click the **connection selector** in the sidebar
2. Click **"Add connection"**
3. Fill in your database details:
   - Database type (PostgreSQL/MySQL/SQLite)
   - For PostgreSQL/MySQL: Host, Port, Username, Password
   - For SQLite: Database file path
   - Database name (optional for PostgreSQL/MySQL - you can browse all databases)
4. Click **Connect**

### Querying Data

- **Double-click a table** to preview its data
- **Write custom SQL** in the query editor
- Press **Ctrl+Enter** or click **Run** to execute
- Results appear in the panel below with row count and execution time

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + Enter` | Execute query |
| `Ctrl + S` | Save query |
| `Ctrl + T` | New tab |
| `Ctrl + W` | Close tab |

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Zustand |
| **Editor** | Monaco Editor |
| **Backend** | Rust, Tauri 2.0 |
| **Database Drivers** | SQLx (PostgreSQL, MySQL, SQLite) |
| **Styling** | Custom CSS with CSS Variables |
| **Build** | Vite, Cargo |

---

## 💻 Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (stable)
- [Tauri CLI](https://tauri.app/v2/guides/getting-started/setup/)

### Project Structure

```
datablaze/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── stores/            # Zustand state management
│   ├── lib/               # Utilities and Tauri bindings
│   └── App.tsx            # Main application
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── database/      # Database drivers (postgres, mysql)
│   │   ├── lib.rs         # Tauri commands
│   │   └── models.rs      # Data structures
│   └── Cargo.toml
├── public/                # Static assets
└── package.json
```

### Running Tests

```bash
# Frontend tests
npm run test

# Rust tests
cd src-tauri && cargo test
```

---

## 🎨 Screenshots

<p align="center">
  <img src="docs/screenshot-dark.png" alt="Dark Theme" width="80%">
  <br>
  <em>Dark theme with query results</em>
</p>

<p align="center">
  <img src="docs/screenshot-light.png" alt="Light Theme" width="80%">
  <br>
  <em>Light theme with table explorer</em>
</p>

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - For the amazing framework
- [SQLx](https://github.com/launchbadge/sqlx) - Async SQL toolkit for Rust
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - VS Code's editor
- [Lucide Icons](https://lucide.dev/) - Beautiful icons

---

<p align="center">
  Made with ❤️ and ⚡
</p>

<p align="center">
  <a href="https://github.com/HaroldXd/Datablaze">
    <img src="https://img.shields.io/github/stars/HaroldXd/Datablaze?style=social" alt="GitHub Stars">
  </a>
</p>
