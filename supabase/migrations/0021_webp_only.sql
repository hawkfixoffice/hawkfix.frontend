-- Применять ПОСЛЕ того, как на сайт выкачена панель с конвертацией в WebP.
-- До этого старая сборка грузит jpg/png, и бакеты их бы отвергли.
update storage.buckets set allowed_mime_types = array['image/webp'] where id = 'avatars';
update storage.buckets set allowed_mime_types = array['image/webp', 'application/pdf'] where id = 'receipts';
