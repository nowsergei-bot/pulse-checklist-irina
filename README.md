# Начальная школа — мастерская Ирины

Рабочая ветка: `irina/primary-school` в репозитории `nowsergei-bot/pulse-checklist-irina`.
Рабочий раздел: https://pulse.primakov-school.ru/cabinet/primary-school.

1. Получите свежую ветку: `git pull --ff-only origin irina/primary-school`.
2. Исправьте интерфейс в `frontend/src/pages/primarySchool/`, запросы в `frontend/src/api/primarySchool.ts`, расчёты и серверные обработчики в `backend/functions/lib/primary*.js` и `backend/functions/primary-school.js`.
3. Проверьте изменения: `npm --prefix frontend ci`, `npm --prefix frontend run build`, `npm --prefix frontend run test:primary`, `npm --prefix backend/functions ci`, `npm --prefix backend/functions run test:primary`.
4. Закоммитьте правки и выполните `git push origin irina/primary-school`.
5. В проверках коммита дождитесь зелёного статуса `pulse/production`. Он означает, что полная версия проверена и установлена на сайте.

Отдельный запрос Сергею и ручное одобрение обычных исправлений не нужны. Автоматический издатель проверяет ветку по расписанию каждые пять минут; GitHub может задерживать запуск. Публикация включает сборку, тесты, совмещение с текущей версией и проверку установленного выпуска. При ошибке или конфликте сайт сохраняет прежнюю версию; исправьте ошибку по ссылке из статуса и отправьте новый коммит. Историю не переписывать (`force-push` не использовать).

Локальный просмотр: `npm --prefix frontend run dev`. В нём только вымышленные данные. Реальные дети, работы и загрузки остаются в Пульсе; пароли и ключи для разработки не нужны. PDF учебников не входят в репозиторий. Просмотр не сохраняет правки в рабочую базу. Проверять работу с реальными данными следует в своём кабинете.

Служебные файлы мастерской (`frontend/src/workspace.tsx`, её зависимости и настройки сборки, инструкции и GitHub Actions) не переносятся в полное приложение. Новые миграции согласовываются отдельно; уже применённые миграции не изменять. API: `https://pulse.primakov-school.ru/api`, apiBase: `https://pulse.primakov-school.ru`.
