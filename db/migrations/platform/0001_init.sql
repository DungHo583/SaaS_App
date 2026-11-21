-- =====================================================================
-- Database điều khiển của NỀN TẢNG (saas_platform). Thiết kế: docs/DATABASE_DESIGN.md
-- Chứa danh sách quán, quản trị nền tảng, OTP, số liệu tổng hợp. KHÔNG chứa dữ liệu vận hành của quán.
-- =====================================================================

CREATE TYPE tenant_kind AS ENUM ('independent', 'chain_member');
CREATE TYPE tenant_status AS ENUM ('provisioning', 'active', 'suspended', 'cancelled');
CREATE TYPE platform_otp_purpose AS ENUM ('login', 'change_email_old', 'change_email_new');

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE FUNCTION block_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Bảng % chỉ cho phép thêm mới, không được %', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'restrict_violation';
END $$;

-- Chuỗi nhà hàng (giai đoạn sau). Quán độc lập không thuộc chuỗi nào.
CREATE TABLE chains (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Subdomain: <slug>.<domain>
    slug           text NOT NULL UNIQUE
                   CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
                          AND slug NOT IN ('www', 'admin', 'api', 'app', 'platform', 'mail', 'static', 'cdn')),
    display_name   text NOT NULL,
    kind           tenant_kind NOT NULL DEFAULT 'independent',
    chain_id       uuid REFERENCES chains (id),
    db_name        text NOT NULL UNIQUE CHECK (db_name ~ '^tenant_[a-z0-9_]{1,50}$'),
    status         tenant_status NOT NULL DEFAULT 'provisioning',
    plan           text NOT NULL DEFAULT 'basic',
    -- Migration mới nhất đã chạy trên database của quán.
    schema_version text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    activated_at   timestamptz,
    suspended_at   timestamptz,
    suspend_reason text,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CHECK ((kind = 'chain_member') = (chain_id IS NOT NULL)),
    CHECK (status <> 'suspended' OR suspended_at IS NOT NULL)
);
CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tenants_no_delete BEFORE DELETE ON tenants FOR EACH ROW EXECUTE FUNCTION block_mutation();

-- Quản trị nền tảng: duy nhất 1 tài khoản đang hoạt động.
CREATE TABLE platform_admins (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    login_email   text NOT NULL UNIQUE,
    -- Email nhận OTP (đổi phải xác thực OTP ở email cũ rồi email mới).
    otp_email     text NOT NULL,
    password_hash text NOT NULL,
    is_active     boolean NOT NULL DEFAULT true,
    last_login_at timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX platform_admins_single_active ON platform_admins ((true)) WHERE is_active;
CREATE TRIGGER platform_admins_updated_at BEFORE UPDATE ON platform_admins FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Mã khôi phục dự phòng (in ra giấy), dùng khi mất cả hai email.
CREATE TABLE platform_recovery_codes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id   uuid NOT NULL REFERENCES platform_admins (id),
    code_hash  text NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_email_changes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id        uuid NOT NULL REFERENCES platform_admins (id),
    old_email       text NOT NULL,
    new_email       text NOT NULL,
    old_verified_at timestamptz,
    new_verified_at timestamptz,
    completed_at    timestamptz,
    cancelled_at    timestamptz,
    expires_at      timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (new_email <> old_email),
    -- Thứ tự bắt buộc: xác thực email cũ -> email mới -> hoàn tất.
    CHECK (new_verified_at IS NULL OR old_verified_at IS NOT NULL),
    CHECK (completed_at IS NULL OR new_verified_at IS NOT NULL),
    CHECK (completed_at IS NULL OR cancelled_at IS NULL)
);
CREATE UNIQUE INDEX platform_email_changes_one_open ON platform_email_changes (admin_id)
    WHERE completed_at IS NULL AND cancelled_at IS NULL;

CREATE TABLE platform_otp_challenges (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id        uuid NOT NULL REFERENCES platform_admins (id),
    purpose         platform_otp_purpose NOT NULL,
    email_change_id uuid REFERENCES platform_email_changes (id),
    sent_to         text NOT NULL,
    code_hash       text NOT NULL,
    attempts        integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
    expires_at      timestamptz NOT NULL,
    consumed_at     timestamptz,
    ip              inet,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at),
    CHECK ((purpose = 'login') = (email_change_id IS NULL))
);

-- Số liệu tổng hợp theo ngày, do job định kỳ đọc từ database của từng quán.
CREATE TABLE tenant_daily_stats (
    tenant_id                  uuid NOT NULL REFERENCES tenants (id),
    stat_date                  date NOT NULL,
    sessions_count             integer NOT NULL DEFAULT 0,
    bills_count                integer NOT NULL DEFAULT 0,
    revenue                    bigint NOT NULL DEFAULT 0,
    abnormal_close_count       integer NOT NULL DEFAULT 0,
    loss_amount                bigint NOT NULL DEFAULT 0,
    cancelled_after_cook_count integer NOT NULL DEFAULT 0,
    -- Mỏ neo chuỗi log của quán: phát hiện nếu log trong DB quán bị sửa sau thời điểm thu thập.
    audit_head_id              bigint,
    audit_head_hash            bytea,
    collected_at               timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, stat_date)
);

-- Log của nền tảng. Mọi lần quản trị nền tảng truy cập 1 quán còn được ghi vào audit_log CỦA QUÁN đó.
CREATE TABLE platform_audit_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    admin_id    uuid REFERENCES platform_admins (id),
    actor_label text NOT NULL,
    action      text NOT NULL,
    tenant_id   uuid REFERENCES tenants (id),
    ip          inet,
    user_agent  text,
    details     jsonb
);
CREATE INDEX platform_audit_log_by_time ON platform_audit_log (occurred_at);
CREATE TRIGGER platform_audit_log_immutable BEFORE UPDATE OR DELETE ON platform_audit_log
    FOR EACH ROW EXECUTE FUNCTION block_mutation();
CREATE TRIGGER platform_audit_log_no_truncate BEFORE TRUNCATE ON platform_audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION block_mutation();
