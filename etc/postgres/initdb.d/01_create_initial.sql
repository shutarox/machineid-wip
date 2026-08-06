-- PostgreSQL の initdb.d は POSTGRES_USER (デフォルト: postgres) で実行される。
-- アプリケーション用の appuser を作成し、必要な権限を付与する。

-- appuser を作成
CREATE USER appuser WITH PASSWORD 'testpass' CREATEDB;

-- myapp データベースを作成
CREATE DATABASE myapp OWNER appuser;

-- タイムゾーン設定（docker-compose の command でも設定しているが念のため）
ALTER DATABASE myapp SET timezone TO 'Asia/Tokyo';
