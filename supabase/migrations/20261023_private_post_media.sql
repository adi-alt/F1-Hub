-- Post photos, videos and files stop being public. Until now the post-media bucket was public, so anyone holding a
-- file's address could open it - including a private community's photos, after someone was removed, or after the
-- community was deleted. The app now serves every upload through /api/posts/media/file, which checks that the viewer
-- may see the post the file belongs to (src/app/api/posts/media/file/route.ts), and reads files with the service role,
-- so nothing in the app needs the bucket to be public. Apply after that code is deployed: before it, posts would show
-- broken images. One setting on one bucket; no rows change, and reverting is `public = true`.

update storage.buckets set public = false where id = 'post-media';
