-- PostgreSQL の initdb.d は POSTGRES_USER (デフォルト: postgres) で実行される。
-- アプリケーション用の appuser を作成し、必要な権限を付与する。

-- appuser を作成
CREATE USER appuser WITH PASSWORD 'testpass' CREATEDB;

-- machineid データベースを作成
CREATE DATABASE machineid OWNER appuser;

-- タイムゾーン設定（docker-compose の command でも設定しているが念のため）
ALTER DATABASE machineid SET timezone TO 'Asia/Tokyo';
