-- =====================================================================
-- Database của MỘT quán (tenant). Thiết kế: docs/DATABASE_DESIGN.md
-- Quy trình nghiệp vụ: docs/BUSINESS_PROCESS.md
--
-- Quy ước: khoá chính UUID, không xoá cứng (deleted_at / trạng thái),
-- tiền là số nguyên VND, thời gian TIMESTAMPTZ.
-- Migration đã chạy thì KHÔNG sửa; thay đổi bằng file migration mới.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Kiểu liệt kê
-- ---------------------------------------------------------------------
CREATE TYPE account_type AS ENUM ('owner', 'manager', 'staff', 'kitchen');
CREATE TYPE order_type AS ENUM ('dine_in', 'takeaway', 'delivery');
CREATE TYPE session_status AS ENUM ('open', 'closed', 'abnormal_pending', 'abnormal_closed', 'abnormal_rejected', 'merged');
CREATE TYPE table_link_reason AS ENUM ('origin', 'transfer', 'merge');
CREATE TYPE round_source AS ENUM ('customer', 'staff');
CREATE TYPE round_status AS ENUM ('pending', 'confirmed', 'rejected', 'junk');
CREATE TYPE item_status AS ENUM ('pending', 'queued', 'cooking', 'ready', 'served', 'cancelled');
CREATE TYPE cancel_stage AS ENUM ('before_cook', 'after_cook', 'sold_out');
CREATE TYPE stock_movement_type AS ENUM ('purchase', 'reserve', 'release', 'consume', 'waste', 'adjust');
CREATE TYPE stocktake_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');
CREATE TYPE bill_kind AS ENUM ('original', 'adjustment', 'replacement');
CREATE TYPE bill_status AS ENUM ('draft', 'issued');
CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer');
CREATE TYPE payment_status AS ENUM ('pending', 'confirmed', 'cancelled');
CREATE TYPE einvoice_status AS ENUM ('pending', 'issued', 'rejected', 'error');
CREATE TYPE approval_type AS ENUM ('abnormal_close', 'stocktake_variance');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE otp_purpose AS ENUM ('view_audit', 'change_bank_account');
CREATE TYPE otp_channel AS ENUM ('email', 'sms');
CREATE TYPE audit_category AS ENUM ('shop', 'customer');
CREATE TYPE audit_actor AS ENUM ('account', 'customer_device', 'platform_admin', 'system');
CREATE TYPE retention_class AS ENUM ('financial', 'general');

-- ---------------------------------------------------------------------
-- Hàm tiện ích
-- ---------------------------------------------------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE FUNCTION array_is_distinct(anyarray) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
    SELECT cardinality($1) = (SELECT count(DISTINCT value) FROM unnest($1) AS value)
$$;

CREATE FUNCTION block_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Bảng % chỉ cho phép thêm mới, không được %', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'restrict_violation';
END $$;

CREATE FUNCTION nonblank(value text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
    SELECT length(trim(coalesce(value, ''))) > 0
$$;

-- ---------------------------------------------------------------------
-- Tài khoản, thiết bị, ca đăng nhập
-- ---------------------------------------------------------------------
CREATE TABLE accounts (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username             text NOT NULL CHECK (username ~ '^[a-z0-9][a-z0-9._]{1,30}[a-z0-9]$'),
    full_name            text NOT NULL CHECK (nonblank(full_name)),
    email                text CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    phone                text,
    account_type         account_type NOT NULL,
    roles                text[] NOT NULL DEFAULT '{}',
    password_hash        text NOT NULL,
    must_change_password boolean NOT NULL DEFAULT true,
    pin_hash             text,
    pin_failed_attempts  integer NOT NULL DEFAULT 0 CHECK (pin_failed_attempts >= 0),
    pin_locked_at        timestamptz,
    is_active            boolean NOT NULL DEFAULT true,
    last_login_at        timestamptz,
    created_by           uuid REFERENCES accounts (id),
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    deactivated_at       timestamptz,
    -- Luật ghép vai trò (BUSINESS_PROCESS 2.1): bếp đứng riêng; nhân viên 1–2 vai trò không gồm bếp.
    CONSTRAINT accounts_roles_valid CHECK (
        array_is_distinct(roles) AND (
            (account_type IN ('owner', 'manager') AND cardinality(roles) = 0)
            OR (account_type = 'kitchen' AND roles = ARRAY['kitchen'])
            OR (account_type = 'staff'
                AND cardinality(roles) BETWEEN 1 AND 2
                AND roles <@ ARRAY['order', 'runner', 'cashier'])
        )
    ),
    -- Đã đổi mật khẩu lần đầu thì bắt buộc đã đặt PIN.
    CONSTRAINT accounts_pin_after_first_login CHECK (must_change_password OR pin_hash IS NOT NULL),
    CONSTRAINT accounts_deactivated_consistent CHECK (is_active = (deactivated_at IS NULL))
);
-- Username không bao giờ dùng lại (kể cả tài khoản đã khoá) để log luôn rõ ràng.
CREATE UNIQUE INDEX accounts_username_key ON accounts (username);
CREATE UNIQUE INDEX accounts_single_owner ON accounts (account_type) WHERE account_type = 'owner';
CREATE UNIQUE INDEX accounts_single_active_kitchen ON accounts (account_type) WHERE account_type = 'kitchen' AND is_active;
CREATE TRIGGER accounts_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tối đa 2 tài khoản quản lý đang hoạt động.
CREATE FUNCTION accounts_manager_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.account_type = 'manager' AND NEW.is_active THEN
        PERFORM pg_advisory_xact_lock(hashtext('accounts_manager_limit'));
        IF (SELECT count(*) FROM accounts
            WHERE account_type = 'manager' AND is_active AND id <> NEW.id) >= 2 THEN
            RAISE EXCEPTION 'Mỗi quán tối đa 2 tài khoản quản lý đang hoạt động' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER accounts_manager_limit BEFORE INSERT OR UPDATE OF account_type, is_active ON accounts
    FOR EACH ROW EXECUTE FUNCTION accounts_manager_limit();

-- Không cho đổi loại tài khoản owner (owner là cố định của quán).
CREATE FUNCTION accounts_owner_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.account_type = 'owner' AND (NEW.account_type <> 'owner' OR NOT NEW.is_active) THEN
        RAISE EXCEPTION 'Không được đổi loại hoặc khoá tài khoản owner' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.account_type <> 'owner' AND NEW.account_type = 'owner' THEN
        RAISE EXCEPTION 'Không được nâng tài khoản thành owner' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER accounts_owner_fixed BEFORE UPDATE OF account_type, is_active ON accounts
    FOR EACH ROW EXECUTE FUNCTION accounts_owner_fixed();
CREATE TRIGGER accounts_no_delete BEFORE DELETE ON accounts FOR EACH ROW EXECUTE FUNCTION block_mutation();

CREATE TABLE devices (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    uuid NOT NULL REFERENCES accounts (id),
    token_hash    text NOT NULL,
    user_agent    text NOT NULL DEFAULT '',
    label         text,
    first_ip      inet,
    last_ip       inet,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at  timestamptz NOT NULL DEFAULT now(),
    approved_at   timestamptz,
    approved_by   uuid REFERENCES accounts (id),
    revoked_at    timestamptz,
    revoked_by    uuid REFERENCES accounts (id),
    UNIQUE (account_id, token_hash),
    CHECK ((approved_at IS NULL) = (approved_by IS NULL))
);

-- Ca đăng nhập: bắt đầu bằng mật khẩu, trong ca chỉ cần PIN.
CREATE TABLE shifts (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES accounts (id),
    device_id  uuid NOT NULL REFERENCES devices (id),
    token_hash text NOT NULL UNIQUE,
    started_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    ended_at   timestamptz,
    end_reason text CHECK (end_reason IN ('logout', 'expired', 'revoked', 'password_changed', 'pin_locked')),
    CHECK (expires_at > started_at),
    CHECK ((ended_at IS NULL) = (end_reason IS NULL))
);
CREATE INDEX shifts_active_by_account ON shifts (account_id) WHERE ended_at IS NULL;

-- OTP cho owner: mở log audit, đổi tài khoản ngân hàng.
CREATE TABLE otp_challenges (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id       uuid NOT NULL REFERENCES accounts (id),
    purpose          otp_purpose NOT NULL,
    channel          otp_channel NOT NULL DEFAULT 'email',
    sent_to          text NOT NULL,
    code_hash        text NOT NULL,
    attempts         integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
    expires_at       timestamptz NOT NULL,
    consumed_at      timestamptz,
    -- Sau khi xác thực: quyền (vd. xem log) có hiệu lực đến thời điểm này.
    grant_expires_at timestamptz,
    ip               inet,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at),
    CHECK (grant_expires_at IS NULL OR consumed_at IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- Cấu hình quán (một dòng duy nhất)
-- ---------------------------------------------------------------------
CREATE TABLE restaurant_settings (
    id                          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    display_name                text NOT NULL CHECK (nonblank(display_name)),
    legal_name                  text NOT NULL DEFAULT '',
    -- MST hộ kinh doanh: 10 số, 10 số-3 số, hoặc 12 số (CCCD).
    tax_code                    text NOT NULL DEFAULT '' CHECK (tax_code ~ '^([0-9]{10}|[0-9]{10}-[0-9]{3}|[0-9]{12})?$'),
    address                     text NOT NULL DEFAULT '',
    phone                       text NOT NULL DEFAULT '',
    email                       text NOT NULL DEFAULT '',
    logo_url                    text,
    -- Tài khoản nhận chuyển khoản (VietQR). Chỉ owner đổi, kèm OTP (kiểm tra ở tầng ứng dụng + audit).
    bank_bin                    text CHECK (bank_bin ~ '^[0-9]{6}$'),
    bank_account_no             text CHECK (bank_account_no ~ '^[0-9A-Za-z]{4,19}$'),
    bank_account_name           text,
    confirm_all_customer_orders boolean NOT NULL DEFAULT true,
    junk_round_minutes          integer NOT NULL DEFAULT 10 CHECK (junk_round_minutes BETWEEN 1 AND 120),
    idle_logout_seconds         integer NOT NULL DEFAULT 60 CHECK (idle_logout_seconds BETWEEN 15 AND 3600),
    pin_max_attempts            integer NOT NULL DEFAULT 5 CHECK (pin_max_attempts BETWEEN 3 AND 10),
    shift_max_hours             integer NOT NULL DEFAULT 14 CHECK (shift_max_hours BETWEEN 1 AND 24),
    require_device_approval     boolean NOT NULL DEFAULT false,
    inventory_enabled           boolean NOT NULL DEFAULT false,
    inventory_blocking          boolean NOT NULL DEFAULT false,
    timezone                    text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    updated_by                  uuid REFERENCES accounts (id),
    CHECK ((bank_bin IS NULL) = (bank_account_no IS NULL))
);
CREATE TRIGGER restaurant_settings_updated_at BEFORE UPDATE ON restaurant_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER restaurant_settings_no_delete BEFORE DELETE ON restaurant_settings FOR EACH ROW EXECUTE FUNCTION block_mutation();

-- ---------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------
CREATE TABLE menu_categories (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL CHECK (nonblank(name)),
    sort_order integer NOT NULL DEFAULT 0,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);
CREATE UNIQUE INDEX menu_categories_name_key ON menu_categories (lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER menu_categories_updated_at BEFORE UPDATE ON menu_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER menu_categories_no_delete BEFORE DELETE ON menu_categories FOR EACH ROW EXECUTE FUNCTION block_mutation();

CREATE TABLE menu_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     uuid NOT NULL REFERENCES menu_categories (id),
    name            text NOT NULL CHECK (nonblank(name)),
    description     text NOT NULL DEFAULT '',
    unit            text NOT NULL DEFAULT 'phần' CHECK (nonblank(unit)),
    price           integer NOT NULL CHECK (price >= 0),
    image_url       text,
    highlight_badge text CHECK (highlight_badge IN ('best_seller', 'must_try', 'recommend', 'new')),
    is_available    boolean NOT NULL DEFAULT true,
    -- Số phần nhập tay khi CHƯA bật module kho. NULL = không giới hạn.
    manual_portions integer CHECK (manual_portions >= 0),
    -- Bếp báo hết món (khác với owner tắt món trên menu).
    sold_out_at     timestamptz,
    sold_out_by     uuid REFERENCES accounts (id),
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,
    CHECK ((sold_out_at IS NULL) = (sold_out_by IS NULL))
);
CREATE UNIQUE INDEX menu_items_name_key ON menu_items (lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX menu_items_category ON menu_items (category_id) WHERE deleted_at IS NULL;
CREATE TRIGGER menu_items_updated_at BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER menu_items_no_delete BEFORE DELETE ON menu_items FOR EACH ROW EXECUTE FUNCTION block_mutation();

-- ---------------------------------------------------------------------
-- Bàn và phiên bàn
-- ---------------------------------------------------------------------
CREATE TABLE dining_tables (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL CHECK (nonblank(name)),
    area       text NOT NULL DEFAULT '',
    capacity   integer NOT NULL DEFAULT 4 CHECK (capacity BETWEEN 1 AND 100),
    -- QR in trên bàn chứa token ngẫu nhiên (không đoán được), KHÔNG chứa id/số bàn.
    qr_token   text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
    sort_order integer NOT NULL DEFAULT 0,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);
CREATE UNIQUE INDEX dining_tables_name_key ON dining_tables (lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER dining_tables_updated_at BEFORE UPDATE ON dining_tables FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER dining_tables_no_delete BEFORE DELETE ON dining_tables FOR EACH ROW EXECUTE FUNCTION block_mutation();

CREATE TABLE table_sessions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_type      order_type NOT NULL DEFAULT 'dine_in',
    status          session_status NOT NULL DEFAULT 'open',
    guest_count     integer CHECK (guest_count > 0),
    opened_at       timestamptz NOT NULL DEFAULT now(),
    opened_by       uuid NOT NULL REFERENCES accounts (id),
    closed_at       timestamptz,
    closed_by       uuid REFERENCES accounts (id),
    merged_into_id  uuid REFERENCES table_sessions (id),
    abnormal_reason text,
    note            text,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CHECK ((status = 'merged') = (merged_into_id IS NOT NULL)),
    CHECK (merged_into_id IS DISTINCT FROM id),
    CHECK ((status = 'open') = (closed_at IS NULL)),
    CHECK (status = 'open' OR closed_by IS NOT NULL),
    CHECK (status NOT IN ('abnormal_pending', 'abnormal_closed', 'abnormal_rejected') OR nonblank(abnormal_reason))
);
CREATE INDEX table_sessions_open ON table_sessions (opened_at) WHERE status = 'open';
CREATE TRIGGER table_sessions_updated_at BEFORE UPDATE ON table_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER table_sessions_no_delete BEFORE DELETE ON table_sessions FOR EACH ROW EXECUTE FUNCTION block_mutation();

-- Liên kết phiên ↔ bàn (1 phiên có thể gắn nhiều bàn khi gộp; mang về/ship không gắn bàn).
CREATE TABLE session_tables (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  uuid NOT NULL REFERENCES table_sessions (id),
    table_id    uuid NOT NULL REFERENCES dining_tables (id),
    reason      table_link_reason NOT NULL DEFAULT 'origin',
    attached_at timestamptz NOT NULL DEFAULT now(),
    attached_by uuid NOT NULL REFERENCES accounts (id),
    detached_at timestamptz,
    detached_by uuid REFERENCES accounts (id)
);
-- Mỗi bàn tối đa MỘT phiên đang mở.
CREATE UNIQUE INDEX session_tables_one_active_per_table ON session_tables (table_id) WHERE detached_at IS NULL;
CREATE INDEX session_tables_by_session ON session_tables (session_id);
CREATE TRIGGER session_tables_no_delete BEFORE DELETE ON session_tables FOR EACH ROW EXECUTE FUNCTION block_mutation();

-- Chỉ gắn bàn vào phiên đang mở.
CREATE FUNCTION session_tables_require_open() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.detached_at IS NULL AND
       (SELECT status FROM table_sessions WHERE id = NEW.session_id) <> 'open' THEN
        RAISE EXCEPTION 'Chỉ gắn bàn vào phiên đang mở' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER session_tables_require_open BEFORE INSERT ON session_tables
    FOR EACH ROW EXECUTE FUNCTION session_tables_require_open();

-- Luật đóng phiên + tự trả bàn khi phiên rời trạng thái 'open'.
CREATE FUNCTION table_sessions_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'open' AND NEW.status IN ('closed', 'abnormal_pending', 'merged'))
        OR (OLD.status = 'abnormal_pending' AND NEW.status IN ('abnormal_closed', 'abnormal_rejected'))
    ) THEN
        RAISE EXCEPTION 'Không được chuyển phiên từ % sang %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;

    -- Đóng phiên bình thường: bắt buộc đã có phiếu thanh toán gốc được phát hành.
    IF NEW.status = 'closed' AND NOT EXISTS (
        SELECT 1 FROM bills WHERE session_id = NEW.id AND kind = 'original' AND status = 'issued'
    ) THEN
        RAISE EXCEPTION 'Chỉ đóng phiên khi đã thanh toán và phát hành phiếu' USING ERRCODE = 'check_violation';
    END IF;

    -- Gộp: phiên B không được còn món chưa chuyển sang phiên A.
    IF NEW.status = 'merged' AND EXISTS (SELECT 1 FROM order_items WHERE session_id = NEW.id) THEN
        RAISE EXCEPTION 'Chuyển hết món sang phiên % trước khi gộp', NEW.merged_into_id USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'open' THEN
        UPDATE session_tables
        SET detached_at = now(), detached_by = NEW.closed_by
        WHERE session_id = NEW.id AND detached_at IS NULL;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER table_sessions_transition BEFORE UPDATE OF status ON table_sessions
    FOR EACH ROW EXECUTE FUNCTION table_sessions_transition();

-- Thiết bị khách đã tham gia phiên (ẩn danh).
CREATE TABLE session_devices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      uuid NOT NULL REFERENCES table_sessions (id),
    device_key_hash text NOT NULL,
    user_agent      text NOT NULL DEFAULT '',
    joined_at       timestamptz NOT NULL DEFAULT now(),
    last_seen_at    timestamptz NOT NULL DEFAULT now(),
    kicked_at       timestamptz,
    kicked_by       uuid REFERENCES accounts (id),
    UNIQUE (session_id, device_key_hash),
    CHECK ((kicked_at IS NULL) = (kicked_by IS NULL))
);

-- ---------------------------------------------------------------------
-- Gọi món
-- ---------------------------------------------------------------------
-- Lượt gọi. Lượt đầu của khách ở trạng thái 'pending' khi bàn CHƯA có phiên (session_id NULL, table_id có).
CREATE TABLE order_rounds (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id               uuid REFERENCES table_sessions (id),
    table_id                 uuid REFERENCES dining_tables (id),
    source                   round_source NOT NULL,
    status                   round_status NOT NULL DEFAULT 'pending',
    idempotency_key          text NOT NULL UNIQUE,
    customer_device_key_hash text,
    created_by               uuid REFERENCES accounts (id),
    created_at               timestamptz NOT NULL DEFAULT now(),
    confirmed_at             timestamptz,
    confirmed_by             uuid REFERENCES accounts (id),
    rejected_at              timestamptz,
    rejected_by              uuid REFERENCES accounts (id),
    reject_reason            text,
    junk_at                  timestamptz,
    restored_at              timestamptz,
    restored_by              uuid REFERENCES accounts (id),
    note                     text,
    CHECK (session_id IS NOT NULL OR table_id IS NOT NULL),
    CHECK ((source = 'staff') = (created_by IS NOT NULL)),
    CHECK (source = 'staff' OR customer_device_key_hash IS NOT NULL),
    CHECK (status <> 'confirmed' OR (session_id IS NOT NULL AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)),
    CHECK (status <> 'rejected' OR (rejected_at IS NOT NULL AND rejected_by IS NOT NULL)),
    CHECK (status <> 'junk' OR junk_at IS NOT NULL),
    CHECK ((restored_at IS NULL) = (restored_by IS NULL)),
    CHECK (restored_at IS NULL OR (junk_at IS NOT NULL AND status = 'confirmed'))
);
CREATE INDEX order_rounds_pending_by_table ON order_rounds (table_id, created_at) WHERE status = 'pending';
CREATE INDEX order_rounds_by_session ON order_rounds (session_id);
CREATE TRIGGER order_rounds_no_delete BEFORE DELETE ON order_rounds FOR EACH ROW EXECUTE FUNCTION block_mutation();

CREATE FUNCTION order_rounds_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status <> NEW.status AND NOT (
        (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'rejected', 'junk'))
        OR (OLD.status = 'junk' AND NEW.status = 'confirmed')   -- khôi phục order rác
    ) THEN
        RAISE EXCEPTION 'Không được chuyển lượt gọi từ % sang %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER order_rounds_transition BEFORE UPDATE OF status ON order_rounds
    FOR EACH ROW EXECUTE FUNCTION order_rounds_transition();

CREATE TABLE order_items (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id      uuid NOT NULL REFERENCES order_rounds (id),
    -- NULL khi lượt gọi đầu chưa được xác nhận (chưa có phiên). Đổi khi gộp bàn.
    session_id    uuid REFERENCES table_sessions (id),
    menu_item_id  uuid NOT NULL REFERENCES menu_items (id),
    name          text NOT NULL,
    unit          text NOT NULL,
    unit_price    integer NOT NULL CHECK (unit_price >= 0),
    quantity      integer NOT NULL CHECK (quantity > 0),
    line_total    integer NOT NULL,
    note          text,
    status        item_status NOT NULL DEFAULT 'pending',
    queued_at     timestamptz,
    cooking_at    timestamptz,
    cooking_by    uuid REFERENCES accounts (id),
    ready_at      timestamptz,
    ready_by      uuid REFERENCES accounts (id),
    served_at     timestamptz,
    served_by     uuid REFERENCES accounts (id),
    cancelled_at  timestamptz,
    cancelled_by  uuid REFERENCES accounts (id),
    cancel_stage  cancel_stage,
    cancel_reason text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (line_total = unit_price * quantity),
    CHECK (status NOT IN ('queued', 'cooking', 'ready', 'served') OR session_id IS NOT NULL),
    CHECK ((status = 'cancelled') = (cancel_stage IS NOT NULL)),
    CHECK (status <> 'cancelled' OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)),
    CHECK (cancel_stage IS DISTINCT FROM 'after_cook' OR nonblank(cancel_reason)),
    CHECK (status <> 'served' OR (served_at IS NOT NULL AND served_by IS NOT NULL))
);
CREATE INDEX order_items_by_session ON order_items (session_id, status);
CREATE INDEX order_items_kitchen_queue ON order_items (queued_at) WHERE status IN ('queued', 'cooking', 'ready');
CREATE TRIGGER order_items_updated_at BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER order_items_no_delete BEFORE DELETE ON order_items FOR EACH ROW EXECUTE FUNCTION block_mutation();

-- Máy trạng thái của món (BUSINESS_PROCESS 4.4) + khoá giá/số lượng sau khi vào bếp.
CREATE FUNCTION order_items_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status <> 'pending' AND (
        NEW.menu_item_id <> OLD.menu_item_id OR NEW.name <> OLD.name OR NEW.unit <> OLD.unit
        OR NEW.unit_price <> OLD.unit_price OR NEW.quantity <> OLD.quantity
    ) THEN
        RAISE EXCEPTION 'Món đã gửi bếp: không được sửa tên, giá, số lượng (huỷ và gọi lại)' USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> NEW.status THEN
        IF NOT (
            (OLD.status = 'pending' AND NEW.status IN ('queued', 'cancelled'))
            OR (OLD.status = 'queued' AND NEW.status IN ('cooking', 'cancelled'))
            OR (OLD.status = 'cooking' AND NEW.status IN ('ready', 'cancelled'))
            OR (OLD.status = 'ready' AND NEW.status IN ('served', 'cancelled'))
        ) THEN
            RAISE EXCEPTION 'Không được chuyển món từ % sang %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.status = 'cancelled' THEN
            IF OLD.status IN ('pending', 'queued') AND NEW.cancel_stage = 'after_cook' THEN
                RAISE EXCEPTION 'Món chưa nấu không thể huỷ dạng after_cook' USING ERRCODE = 'check_violation';
            END IF;
            IF OLD.status IN ('cooking', 'ready') AND NEW.cancel_stage <> 'after_cook' THEN
                RAISE EXCEPTION 'Món đang/đã nấu chỉ huỷ dạng after_cook (có lý do, tính hao hụt)' USING ERRCODE = 'check_violation';
            END IF;
        END IF;

        IF NEW.status = 'queued' THEN NEW.queued_at := coalesce(NEW.queued_at, now()); END IF;
        IF NEW.status = 'cooking' THEN NEW.cooking_at := coalesce(NEW.cooking_at, now()); END IF;
        IF NEW.status = 'ready' THEN NEW.ready_at := coalesce(NEW.ready_at, now()); END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER order_items_transition BEFORE UPDATE ON order_items
    FOR EACH ROW EXECUTE FUNCTION order_items_transition();

-- Nhãn "món đã gọi": theo phiên + theo số lượng, mất khi đã phục vụ.
CREATE VIEW session_ordered_badges AS
SELECT session_id, menu_item_id, sum(quantity)::integer AS unserved_quantity
FROM order_items
WHERE session_id IS NOT NULL AND status IN ('pending', 'queued', 'cooking', 'ready')
GROUP BY session_id, menu_item_id;

-- ---------------------------------------------------------------------
-- Kho nguyên liệu (module tuỳ chọn)
-- ---------------------------------------------------------------------
CREATE TABLE ingredients (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text NOT NULL CHECK (nonblank(name)),
    usage_unit          text NOT NULL DEFAULT 'g',
    purchase_unit       text NOT NULL DEFAULT 'kg',
    usage_per_purchase  numeric(14, 3) NOT NULL DEFAULT 1000 CHECK (usage_per_purchase > 0),
    -- Gia vị/dầu/nước mắm: is_tracked = false (không tính số phần, không chặn bán).
    is_tracked          boolean NOT NULL DEFAULT true,
    waste_factor        numeric(5, 4) NOT NULL DEFAULT 0 CHECK (waste_factor >= 0 AND waste_factor < 1),
    low_stock_threshold numeric(14, 3) CHECK (low_stock_threshold >= 0),
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
CREATE UNIQUE INDEX ingredients_name_key ON ingredients (lower(name)) WHERE deleted_at IS NULL;
CREATE TRIGGER ingredients_updated_at BEFORE UPDATE ON ingredients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER ingredients_no_delete BEFORE DELETE ON ingredients FOR EACH ROW EXECUTE FUNCTION block_mutation();

-- Định lượng: lượng nguyên liệu (đơn vị usage_unit) cho 1 phần món.
CREATE TABLE recipe_lines (
    menu_item_id  uuid NOT NULL REFERENCES menu_items (id),
    ingredient_id uuid NOT NULL REFERENCES ingredients (id),
    quantity      numeric(14, 3) NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (menu_item_id, ingredient_id)
);

CREATE TABLE stocktakes (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    status       stocktake_status NOT NULL DEFAULT 'draft',
    created_by   uuid NOT NULL REFERENCES accounts (id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    submitted_at timestamptz,
    decided_by   uuid REFERENCES accounts (id),
    decided_at   timestamptz,
    note         text,
    CHECK (status IN ('draft') OR submitted_at IS NOT NULL),
    CHECK (status NOT IN ('approved', 'rejected') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);

CREATE TABLE stocktake_lines (
    stocktake_id     uuid NOT NULL REFERENCES stocktakes (id),
    ingredient_id    uuid NOT NULL REFERENCES ingredients (id),
    system_quantity  numeric(14, 3) NOT NULL,
    counted_quantity numeric(14, 3) NOT NULL CHECK (counted_quantity >= 0),
    PRIMARY KEY (stocktake_id, ingredient_id)
);

-- Sổ kho: chỉ thêm. Tồn thực = purchase + consume + waste + adjust; đang giữ chỗ = -(reserve + release).
CREATE TABLE stock_movements (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id uuid NOT NULL REFERENCES ingredients (id),
    movement_type stock_movement_type NOT NULL,
    quantity      numeric(14, 3) NOT NULL CHECK (quantity <> 0),
    unit_cost     integer CHECK (unit_cost >= 0),
    order_item_id uuid REFERENCES order_items (id),
    stocktake_id  uuid REFERENCES stocktakes (id),
    created_by    uuid REFERENCES accounts (id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    note          text,
    CHECK (
        (movement_type IN ('purchase', 'release') AND quantity > 0)
        OR (movement_type IN ('reserve', 'consume', 'waste') AND quantity < 0)
        OR movement_type = 'adjust'
    ),
    CHECK (movement_type NOT IN ('reserve', 'release', 'consume') OR order_item_id IS NOT NULL),
    CHECK (movement_type <> 'adjust' OR stocktake_id IS NOT NULL),
    CHECK (movement_type <> 'purchase' OR created_by IS NOT NULL)
);
CREATE INDEX stock_movements_by_ingredient ON stock_movements (ingredient_id, created_at);
CREATE TRIGGER stock_movements_immutable BEFORE UPDATE OR DELETE ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION block_mutation();

CREATE VIEW ingredient_stock AS
SELECT i.id AS ingredient_id,
       i.name,
       i.usage_unit,
       i.is_tracked,
       coalesce(sum(m.quantity) FILTER (WHERE m.movement_type IN ('purchase', 'consume', 'waste', 'adjust')), 0) AS on_hand,
       coalesce(-sum(m.quantity) FILTER (WHERE m.movement_type IN ('reserve', 'release')), 0) AS reserved
FROM ingredients i
LEFT JOIN stock_movements m ON m.ingredient_id = i.id
WHERE i.deleted_at IS NULL
GROUP BY i.id, i.name, i.usage_unit, i.is_tracked;

-- Số phần TỐI ĐA làm được = min(floor((tồn - giữ chỗ) / (định lượng × (1 + hao hụt)))) trên nguyên liệu có theo dõi.
CREATE VIEW menu_item_portions AS
SELECT r.menu_item_id,
       greatest(0, min(floor((s.on_hand - s.reserved) / (r.quantity * (1 + i.waste_factor)))))::integer AS max_portions
FROM recipe_lines r
JOIN ingredients i ON i.id = r.ingredient_id AND i.is_tracked AND i.deleted_at IS NULL
JOIN ingredient_stock s ON s.ingredient_id = r.ingredient_id
GROUP BY r.menu_item_id;

-- ---------------------------------------------------------------------
-- Phiếu thanh toán, thanh toán, hoá đơn điện tử
-- ---------------------------------------------------------------------
CREATE TABLE bill_sequences (
    series      text PRIMARY KEY CHECK (series ~ '^[A-Z0-9]{1,10}$'),
    next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0)
);
INSERT INTO bill_sequences (series) VALUES ('PTT');

CREATE TABLE bills (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id        uuid NOT NULL REFERENCES table_sessions (id),
    kind              bill_kind NOT NULL DEFAULT 'original',
    original_bill_id  uuid REFERENCES bills (id),
    adjustment_reason text,
    status            bill_status NOT NULL DEFAULT 'draft',
    series            text NOT NULL DEFAULT 'PTT' REFERENCES bill_sequences (series),
    number            bigint,
    issued_at         timestamptz,
    issued_by         uuid REFERENCES accounts (id),
    -- Snapshot người bán tại thời điểm phát hành (tự lấy từ restaurant_settings nếu để trống).
    seller_name       text,
    seller_legal_name text,
    seller_tax_code   text,
    seller_address    text,
    seller_phone      text,
    -- Người mua (khi khách yêu cầu, vd. khách công ty).
    buyer_name        text,
    buyer_company     text,
    buyer_tax_code    text,
    buyer_address     text,
    buyer_email       text,
    subtotal          integer NOT NULL DEFAULT 0,
    discount          integer NOT NULL DEFAULT 0 CHECK (discount >= 0),
    total             integer NOT NULL DEFAULT 0,
    total_in_words    text,
    note              text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid NOT NULL REFERENCES accounts (id),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (series, number),
    CHECK (total = subtotal - discount),
    CHECK (kind = 'adjustment' OR (subtotal >= 0 AND total >= 0)),
    CHECK ((kind = 'original') = (original_bill_id IS NULL)),
    CHECK (kind = 'original' OR nonblank(adjustment_reason)),
    CHECK (status = 'draft' OR (number IS NOT NULL AND issued_at IS NOT NULL AND issued_by IS NOT NULL
                                AND seller_name IS NOT NULL AND nonblank(total_in_words)))
);
-- 1 phiên = 1 phiếu gốc (không tách bill). 1 phiếu gốc có tối đa 1 phiếu thay thế.
CREATE UNIQUE INDEX bills_one_original_per_session ON bills (session_id) WHERE kind = 'original';
CREATE UNIQUE INDEX bills_one_replacement ON bills (original_bill_id) WHERE kind = 'replacement';
CREATE TRIGGER bills_updated_at BEFORE UPDATE ON bills FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE bill_lines (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id       uuid NOT NULL REFERENCES bills (id),
    line_no       integer NOT NULL CHECK (line_no > 0),
    order_item_id uuid REFERENCES order_items (id),
    name          text NOT NULL,
    unit          text NOT NULL,
    quantity      integer NOT NULL CHECK (quantity <> 0),
    unit_price    integer NOT NULL CHECK (unit_price >= 0),
    discount      integer NOT NULL DEFAULT 0 CHECK (discount >= 0),
    line_total    integer NOT NULL,
    UNIQUE (bill_id, line_no),
    CHECK (line_total = quantity * unit_price - discount)
);

CREATE TABLE payments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id          uuid NOT NULL REFERENCES bills (id),
    method           payment_method NOT NULL,
    amount           integer NOT NULL CHECK (amount > 0),
    status           payment_status NOT NULL DEFAULT 'pending',
    cash_received    integer,
    change_given     integer GENERATED ALWAYS AS (cash_received - amount) STORED,
    -- Nội dung chuyển khoản chứa mã phiếu, dùng để đối soát tự động sau này.
    transfer_content text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid NOT NULL REFERENCES accounts (id),
    confirmed_at     timestamptz,
    confirmed_by     uuid REFERENCES accounts (id),
    cancelled_at     timestamptz,
    cancelled_by     uuid REFERENCES accounts (id),
    cancel_reason    text,
    CHECK (method <> 'cash' OR cash_received >= amount),
    CHECK (method = 'cash' OR cash_received IS NULL),
    CHECK (method <> 'bank_transfer' OR nonblank(transfer_content)),
    CHECK (status <> 'confirmed' OR (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)),
    CHECK (status <> 'cancelled' OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND nonblank(cancel_reason)))
);
CREATE INDEX payments_by_bill ON payments (bill_id);
CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION block_mutation();

CREATE FUNCTION payments_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status <> 'pending' THEN
        RAISE EXCEPTION 'Khoản thanh toán đã % không được sửa', OLD.status USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.bill_id <> OLD.bill_id OR NEW.method <> OLD.method OR NEW.amount <> OLD.amount
       OR NEW.cash_received IS DISTINCT FROM OLD.cash_received THEN
        RAISE EXCEPTION 'Chỉ được xác nhận hoặc huỷ khoản thanh toán, không sửa số tiền' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER payments_transition BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION payments_transition();

-- Phát hành phiếu: kiểm tra luật nghiệp vụ, cấp số liên tục, khoá vĩnh viễn.
CREATE FUNCTION bills_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    lines_total integer;
    paid_total  integer;
    next_no     bigint;
    settings    restaurant_settings%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Không được xoá phiếu thanh toán' USING ERRCODE = 'restrict_violation';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'issued' THEN
        RAISE EXCEPTION 'Phiếu % đã phát hành: không được sửa (lập phiếu điều chỉnh/thay thế)', OLD.number
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF TG_OP = 'INSERT' AND NEW.status = 'issued' THEN
        RAISE EXCEPTION 'Tạo phiếu ở trạng thái draft rồi mới phát hành' USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status = 'issued' THEN
        IF NEW.kind = 'original' AND EXISTS (
            SELECT 1 FROM order_items
            WHERE session_id = NEW.session_id AND status IN ('pending', 'queued', 'cooking', 'ready')
        ) THEN
            RAISE EXCEPTION 'Còn món chưa phục vụ hoặc chưa huỷ: không được thanh toán' USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.kind <> 'original' AND NOT EXISTS (
            SELECT 1 FROM bills WHERE id = NEW.original_bill_id AND status = 'issued'
        ) THEN
            RAISE EXCEPTION 'Phiếu gốc phải được phát hành trước' USING ERRCODE = 'check_violation';
        END IF;

        SELECT coalesce(sum(line_total), 0) INTO lines_total FROM bill_lines WHERE bill_id = NEW.id;
        IF lines_total <> NEW.subtotal THEN
            RAISE EXCEPTION 'Tổng dòng (%) khác tổng tiền hàng (%)', lines_total, NEW.subtotal USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.kind = 'original' THEN
            SELECT coalesce(sum(amount), 0) INTO paid_total FROM payments
            WHERE bill_id = NEW.id AND status = 'confirmed';
            IF paid_total <> NEW.total THEN
                RAISE EXCEPTION 'Đã thu % nhưng phiếu cần thu %', paid_total, NEW.total USING ERRCODE = 'check_violation';
            END IF;
        END IF;

        SELECT * INTO settings FROM restaurant_settings WHERE id = 1;
        NEW.seller_name       := coalesce(NEW.seller_name, settings.display_name);
        NEW.seller_legal_name := coalesce(NEW.seller_legal_name, settings.legal_name);
        NEW.seller_tax_code   := coalesce(NEW.seller_tax_code, settings.tax_code);
        NEW.seller_address    := coalesce(NEW.seller_address, settings.address);
        NEW.seller_phone      := coalesce(NEW.seller_phone, settings.phone);
        NEW.issued_at         := coalesce(NEW.issued_at, now());

        -- Cấp số liên tục: khoá dòng sequence tới khi COMMIT; rollback thì số không bị mất.
        UPDATE bill_sequences SET next_number = next_number + 1
        WHERE series = NEW.series
        RETURNING next_number - 1 INTO next_no;
        NEW.number := next_no;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status = 'draft' AND NEW.number IS NOT NULL THEN
        RAISE EXCEPTION 'Số phiếu chỉ được cấp khi phát hành' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER bills_guard BEFORE INSERT OR UPDATE OR DELETE ON bills FOR EACH ROW EXECUTE FUNCTION bills_guard();

CREATE FUNCTION bill_lines_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND (SELECT status FROM bills WHERE id = OLD.bill_id) = 'issued' THEN
        RAISE EXCEPTION 'Phiếu đã phát hành: không được thay đổi dòng' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND (SELECT status FROM bills WHERE id = NEW.bill_id) = 'issued' THEN
        RAISE EXCEPTION 'Phiếu đã phát hành: không được thay đổi dòng' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER bill_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON bill_lines
    FOR EACH ROW EXECUTE FUNCTION bill_lines_guard();

CREATE FUNCTION payments_require_draft_bill() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT status FROM bills WHERE id = NEW.bill_id) = 'issued' THEN
        RAISE EXCEPTION 'Phiếu đã phát hành: không thêm khoản thanh toán' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER payments_require_draft_bill BEFORE INSERT ON payments
    FOR EACH ROW EXECUTE FUNCTION payments_require_draft_bill();

-- Hoá đơn điện tử (module sau): sinh từ phiếu đã phát hành, theo dõi trạng thái với nhà cung cấp.
CREATE TABLE einvoices (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id            uuid NOT NULL UNIQUE REFERENCES bills (id),
    provider           text NOT NULL,
    template_code      text,
    invoice_series     text,
    invoice_number     text,
    tax_authority_code text,
    lookup_code        text,
    lookup_url         text,
    status             einvoice_status NOT NULL DEFAULT 'pending',
    request_payload    jsonb,
    response_payload   jsonb,
    error_message      text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    sent_at            timestamptz,
    issued_at          timestamptz,
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CHECK (status <> 'issued' OR (invoice_number IS NOT NULL AND issued_at IS NOT NULL))
);
CREATE TRIGGER einvoices_updated_at BEFORE UPDATE ON einvoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER einvoices_no_delete BEFORE DELETE ON einvoices FOR EACH ROW EXECUTE FUNCTION block_mutation();

-- ---------------------------------------------------------------------
-- Phê duyệt (chỉ owner quyết định)
-- ---------------------------------------------------------------------
CREATE TABLE approvals (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_type approval_type NOT NULL,
    status        approval_status NOT NULL DEFAULT 'pending',
    session_id    uuid REFERENCES table_sessions (id),
    stocktake_id  uuid REFERENCES stocktakes (id),
    -- Giá trị thất thoát (đóng phiên bất thường) hoặc chênh lệch kho quy ra tiền.
    amount        integer,
    reason        text NOT NULL CHECK (nonblank(reason)),
    requested_by  uuid NOT NULL REFERENCES accounts (id),
    requested_at  timestamptz NOT NULL DEFAULT now(),
    decided_by    uuid REFERENCES accounts (id),
    decided_at    timestamptz,
    decision_note text,
    CHECK ((approval_type = 'abnormal_close') = (session_id IS NOT NULL)),
    CHECK ((approval_type = 'stocktake_variance') = (stocktake_id IS NOT NULL)),
    CHECK ((status = 'pending') = (decided_by IS NULL)),
    CHECK ((decided_by IS NULL) = (decided_at IS NULL))
);
CREATE UNIQUE INDEX approvals_one_per_session ON approvals (session_id) WHERE session_id IS NOT NULL;
CREATE TRIGGER approvals_no_delete BEFORE DELETE ON approvals FOR EACH ROW EXECUTE FUNCTION block_mutation();

CREATE FUNCTION approvals_owner_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status <> 'pending' THEN
        RAISE EXCEPTION 'Yêu cầu đã được quyết định, không được sửa' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status <> 'pending' AND
       (SELECT account_type FROM accounts WHERE id = NEW.decided_by) IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'Chỉ owner được duyệt' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER approvals_owner_only BEFORE UPDATE ON approvals FOR EACH ROW EXECUTE FUNCTION approvals_owner_only();

-- ---------------------------------------------------------------------
-- Log audit: chỉ thêm, chuỗi băm phát hiện chỉnh sửa
-- ---------------------------------------------------------------------
CREATE SEQUENCE audit_log_id_seq;

CREATE TABLE audit_log (
    id                       bigint PRIMARY KEY,
    occurred_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
    category                 audit_category NOT NULL,
    retention                retention_class NOT NULL DEFAULT 'general',
    actor_type               audit_actor NOT NULL,
    actor_account_id         uuid REFERENCES accounts (id),
    -- Tên hiển thị tại thời điểm ghi (username, "khách", email quản trị nền tảng, "system").
    actor_label              text NOT NULL,
    role_context             text CHECK (role_context IN ('owner', 'manager', 'order', 'runner', 'cashier', 'kitchen')),
    -- ✓⚠: owner/quản lý làm thao tác bếp trong trường hợp bất khả kháng.
    is_elevated              boolean NOT NULL DEFAULT false,
    device_id                uuid REFERENCES devices (id),
    customer_device_key_hash text,
    ip                       inet,
    user_agent               text,
    action                   text NOT NULL CHECK (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
    entity_type              text,
    entity_id                text,
    session_id               uuid REFERENCES table_sessions (id),
    before_data              jsonb,
    after_data               jsonb,
    reason                   text,
    prev_hash                bytea,
    row_hash                 bytea NOT NULL,
    CHECK ((actor_type = 'account') = (actor_account_id IS NOT NULL)),
    CHECK (actor_type <> 'customer_device' OR (category = 'customer' AND customer_device_key_hash IS NOT NULL))
);
CREATE INDEX audit_log_by_time ON audit_log (category, occurred_at);
CREATE INDEX audit_log_by_entity ON audit_log (entity_type, entity_id);
CREATE INDEX audit_log_by_session ON audit_log (session_id) WHERE session_id IS NOT NULL;

-- Băm có định dạng cố định (không phụ thuộc DateStyle/TimeZone của phiên kết nối).
CREATE FUNCTION audit_row_hash(prev bytea, r audit_log) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
    SELECT sha256(convert_to(concat_ws(E'\x1f',
        encode(coalesce(prev, ''::bytea), 'hex'),
        r.id::text,
        to_char(r.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
        r.category::text, r.retention::text, r.actor_type::text,
        coalesce(r.actor_account_id::text, ''), r.actor_label, coalesce(r.role_context, ''),
        r.is_elevated::text, coalesce(r.device_id::text, ''), coalesce(r.customer_device_key_hash, ''),
        coalesce(host(r.ip), ''), coalesce(r.user_agent, ''), r.action,
        coalesce(r.entity_type, ''), coalesce(r.entity_id, ''), coalesce(r.session_id::text, ''),
        coalesce(r.before_data::text, ''), coalesce(r.after_data::text, ''), coalesce(r.reason, '')
    ), 'UTF8'))
$$;

CREATE FUNCTION audit_log_chain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- Tuần tự hoá việc ghi để id tăng dần đúng thứ tự chuỗi.
    PERFORM pg_advisory_xact_lock(hashtext('audit_log_chain'));
    NEW.id := nextval('audit_log_id_seq');
    NEW.occurred_at := clock_timestamp();
    SELECT row_hash INTO NEW.prev_hash FROM audit_log ORDER BY id DESC LIMIT 1;
    NEW.row_hash := audit_row_hash(NEW.prev_hash, NEW);
    RETURN NEW;
END $$;
CREATE TRIGGER audit_log_chain BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_chain();

-- Không UPDATE; không DELETE, trừ job dọn log quá hạn lưu trữ (đặt app.audit_purge = 'on').
CREATE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    keep_for interval;
BEGIN
    IF TG_OP = 'DELETE' AND current_setting('app.audit_purge', true) = 'on' THEN
        keep_for := CASE OLD.retention WHEN 'financial' THEN interval '10 years' ELSE interval '2 years' END;
        IF OLD.occurred_at < now() - keep_for THEN
            RETURN OLD;
        END IF;
    END IF;
    RAISE EXCEPTION 'audit_log là bất biến: không được %', TG_OP USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION block_mutation();

-- Kiểm tra chuỗi: trả về id đầu tiên bị sai (NULL = toàn vẹn).
CREATE FUNCTION audit_verify_chain() RETURNS bigint LANGUAGE plpgsql STABLE AS $$
DECLARE
    r         audit_log%ROWTYPE;
    expected  bytea;
    first_row boolean := true;
BEGIN
    FOR r IN SELECT * FROM audit_log ORDER BY id LOOP
        -- Dòng đầu tiên còn lại (sau khi dọn log quá hạn) được tin theo prev_hash của nó.
        IF NOT first_row AND r.prev_hash IS DISTINCT FROM expected THEN
            RETURN r.id;
        END IF;
        IF audit_row_hash(r.prev_hash, r) <> r.row_hash THEN
            RETURN r.id;
        END IF;
        expected := r.row_hash;
        first_row := false;
    END LOOP;
    RETURN NULL;
END $$;
