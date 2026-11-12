-- ============================================================================
-- BUZZ! WEB WORLD — SCHÉMA POSTGRESQL 16 COMPLET (MASTER RFC V1.1)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(24) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_preset VARCHAR(32) NOT NULL DEFAULT 'rocker',
    avatar_color VARCHAR(7) NOT NULL DEFAULT '#0066FF',
    buzzer_sound VARCHAR(32) NOT NULL DEFAULT 'classic_tv',
    role VARCHAR(16) NOT NULL DEFAULT 'USER',
    global_stats JSONB NOT NULL DEFAULT '{"games_played":0,"games_won":0,"total_questions":0,"correct_answers":0,"avg_reaction_ms":0,"titles_won":{}}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE friend_rivalries (
    user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    games_together INT NOT NULL DEFAULT 0,
    a_finished_ahead INT NOT NULL DEFAULT 0,
    b_finished_ahead INT NOT NULL DEFAULT 0,
    a_tarted_b INT NOT NULL DEFAULT 0,
    b_tarted_a INT NOT NULL DEFAULT 0,
    a_stole_from_b_pts INT NOT NULL DEFAULT 0,
    b_stole_from_a_pts INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_a_id, user_b_id),
    CONSTRAINT ordered_users CHECK (user_a_id < user_b_id)
);

CREATE TABLE quiz_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(80) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    category VARCHAR(32) NOT NULL,
    visibility VARCHAR(16) NOT NULL DEFAULT 'PRIVATE',
    is_official BOOLEAN NOT NULL DEFAULT FALSE,
    questions_count INT NOT NULL DEFAULT 0,
    downloads_count INT NOT NULL DEFAULT 0,
    rating_sum INT NOT NULL DEFAULT 0,
    rating_count INT NOT NULL DEFAULT 0,
    cloned_from_id UUID REFERENCES quiz_packs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_id UUID NOT NULL REFERENCES quiz_packs(id) ON DELETE CASCADE,
    sub_theme VARCHAR(40) NOT NULL,
    difficulty SMALLINT NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 3),
    format VARCHAR(20) NOT NULL DEFAULT 'TEXT_CLASSIC'
        CHECK (format IN ('TEXT_CLASSIC', 'IMAGE_STANDARD', 'IMAGE_REVEAL', 'AUDIO_CLIP')),
    prompt VARCHAR(160) NOT NULL,
    choices JSONB NOT NULL,
    correct_index SMALLINT NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
    media_key TEXT,
    media_duration_ms INT CHECK (media_duration_ms IS NULL OR media_duration_ms BETWEEN 5000 AND 15000),
    tts_cache_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_choices_array CHECK (
        jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) = 4
    ),
    CONSTRAINT media_required_for_non_text CHECK (
        (format = 'TEXT_CLASSIC' AND media_key IS NULL) OR
        (format <> 'TEXT_CLASSIC' AND media_key IS NOT NULL)
    )
);

CREATE TABLE user_downloaded_packs (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_id UUID NOT NULL REFERENCES quiz_packs(id) ON DELETE CASCADE,
    downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, pack_id)
);

CREATE INDEX idx_questions_pack_id ON questions(pack_id);
CREATE INDEX idx_quiz_packs_author_id ON quiz_packs(author_id);
CREATE INDEX idx_quiz_packs_official_public ON quiz_packs(is_official, visibility);
