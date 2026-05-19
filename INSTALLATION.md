# Installation Guide

## Requirements

- Node.js 18 or newer
- npm (comes with Node.js)

## Backend setup

1. افتح الطرفية في مجلد المشروع:
   ```powershell
   cd "c:\Users\abdal\OneDrive\Desktop\GRAAAAAAD\backend"
   ```

2. ثبّت الحزم:
   ```powershell
   npm install
   ```

3. أنشئ ملف إعداد البيئة `.env` إذا لم يكن موجودًا.

4. عدّل `.env` وضع قيمة `JWT_SECRET` و `PORT`.

5. شغّل الخادم:
   ```powershell
   npm start
   ```

## تشغيل الواجهة الأمامية

- الملفات الثابتة موجودة في `frontend/`.
- بعد تشغيل الخادم، يمكن فتح `http://localhost:3000` في المتصفح.

## ملاحظة مهمة

- إذا أرسلت المشروع لشخص آخر، يجب عليه:
  - تثبيت Node.js و npm
  - تشغيل `npm install` داخل `backend/`
  - إنشاء ملف `.env` وكتابة المتغيرات المناسبة
  - التأكد من وجود `academyai.db` داخل `backend/`

## ملفات المشروع الأساسية

- `backend/server.js`
- `backend/package.json`
- `backend/package-lock.json`
- `backend/.env.example`
- `backend/academyai.db`
- `backend/uploads/`
- `frontend/INDEX.html`
- `frontend/script.js`
- `frontend/style.css`
