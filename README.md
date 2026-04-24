# 🚀 Brimble Challenge: The "Internal Cloud" Engine

This is my implementation for the Brimble infrastructure challenge. My goal wasn't just to build a simple "git cloner," but to design a mini-PaaS (Platform as a Service) that mirrors how production environments like Brimble, Railway, or Vercel actually function.

## 🧠 The Philosophy: "Infrastructure as a Product"

When I started this, I asked myself: _How do you build a deployment engine that doesn't crash the host server when 10 people deploy at once?_ I focused on three pillars: **Visibility**, **Stability**, and **State**.

### 1. The Concurrency Problem (The Worker Pool)

A naive approach would be to start a `railpack build` as soon as an API request hits the server. On a standard VPS, 3 or 4 simultaneous Docker builds will spike the CPU and freeze the OS.

- **My Solution:** I implemented a **Worker-Pool Queue**. The API accepts the request, saves the intent to the database, and puts the task in a line. A dedicated worker processes these builds one by one (or with controlled concurrency), protecting the host's resources.

### 2. Real-time Feedback (The Log Stream)

Deployment is an anxious process for developers. Seeing a spinner for 2 minutes is a bad experience.

- **My Solution:** I built a `LogEmitter` bridge using Node.js EventEmitters and **Server-Sent Events (SSE)**. As Railpack generates logs, they are piped in real-time to the frontend. No polling, no lag.

### 3. Data Integrity (Atomic Transactions)

I split the data model into `Projects` (the identity) and `Deployments` (the versions).

- **My Solution:** I used **Drizzle ORM** with strict Postgres transactions. When you click deploy, the creation of the project record and the incrementing of the version number happen atomically. If one fails, the whole state rolls back. No "ghost" projects or skipped version numbers.

---

## 🛠 The Tech Stack

- **Backend:** Node.js (TypeScript) + Express
- **Database:** PostgreSQL + Drizzle ORM
- **Build Engine:** Railpack (Cloud Native Buildpacks style)
- **Container Orchestration:** Docker (via Dockerode/Unix Sockets)
- **Real-time:** Server-Sent Events (SSE)

---

## 🏗 System Architecture

1.  **API Layer:** Validates the Git URL and initiates a DB transaction.
2.  **Task Queue:** Holds the deployment task and manages concurrency to save CPU/RAM.
3.  **Build Service:** - Clones the repo into a temporary `/tmp` directory.
    - Spawns a `railpack` process to detect language and build a Docker image.
    - Streams `stdout/stderr` to the UI via an EventEmitter.
    - Cleans up the source code immediately after the build to save disk space.
4.  **Deployment Service:** (Upcoming) Stops the previous container version and boots the new image on a shared `brimble-net` network.

---

## 🚀 How to run it

1. **Clone the repo**
2. **Environment Setup:**
   ```bash
   cp .env.example .env
   # Make sure your DATABASE_URL points to a Postgres instance
   ```
3. **Docker Compose:**
   ```bash
   docker-compose up --build
   ```
4. **Access the Dashboard:**
   Head to `http://localhost:3000` to start your first deployment.
