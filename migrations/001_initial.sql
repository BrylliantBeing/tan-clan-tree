CREATE TABLE people (
  id CHAR(36) NOT NULL PRIMARY KEY,
  full_name VARCHAR(200) NOT NULL,
  birth_date DATE NULL,
  is_deceased TINYINT(1) NOT NULL DEFAULT 0,
  death_date DATE NULL,
  facebook_url VARCHAR(500) NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_by CHAR(36) NULL,
  reviewed_by CHAR(36) NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY people_status (status),
  CONSTRAINT fk_people_created_by FOREIGN KEY (created_by) REFERENCES people (id) ON DELETE SET NULL,
  CONSTRAINT fk_people_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES people (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE accounts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  person_id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('member', 'admin') NOT NULL DEFAULT 'member',
  disabled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY accounts_person (person_id),
  UNIQUE KEY accounts_email (email),
  CONSTRAINT fk_accounts_person FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- person_a_id always sorts before person_b_id, so each couple can only be stored once
CREATE TABLE spouses (
  person_a_id CHAR(36) NOT NULL,
  person_b_id CHAR(36) NOT NULL,
  PRIMARY KEY (person_a_id, person_b_id),
  KEY spouses_person_b (person_b_id),
  CONSTRAINT fk_spouses_person_a FOREIGN KEY (person_a_id) REFERENCES people (id) ON DELETE CASCADE,
  CONSTRAINT fk_spouses_person_b FOREIGN KEY (person_b_id) REFERENCES people (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE parent_child (
  parent_id CHAR(36) NOT NULL,
  child_id CHAR(36) NOT NULL,
  PRIMARY KEY (parent_id, child_id),
  KEY parent_child_child (child_id),
  CONSTRAINT fk_parent_child_parent FOREIGN KEY (parent_id) REFERENCES people (id) ON DELETE CASCADE,
  CONSTRAINT fk_parent_child_child FOREIGN KEY (child_id) REFERENCES people (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invites (
  id CHAR(36) NOT NULL PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  created_by CHAR(36) NOT NULL,
  relation_type ENUM('spouse', 'child', 'parent') NOT NULL,
  relative_id CHAR(36) NOT NULL,
  other_parent_id CHAR(36) NULL,
  expires_at DATETIME NOT NULL,
  claimed_person_id CHAR(36) NULL,
  claimed_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY invites_token_hash (token_hash),
  KEY invites_created_by (created_by),
  CONSTRAINT fk_invites_created_by FOREIGN KEY (created_by) REFERENCES people (id) ON DELETE CASCADE,
  CONSTRAINT fk_invites_relative FOREIGN KEY (relative_id) REFERENCES people (id) ON DELETE CASCADE,
  CONSTRAINT fk_invites_other_parent FOREIGN KEY (other_parent_id) REFERENCES people (id) ON DELETE CASCADE,
  CONSTRAINT fk_invites_claimed_person FOREIGN KEY (claimed_person_id) REFERENCES people (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  KEY sessions_account (account_id),
  CONSTRAINT fk_sessions_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE password_resets (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  KEY password_resets_account (account_id),
  CONSTRAINT fk_password_resets_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  ip VARCHAR(64) NOT NULL,
  attempted_at DATETIME NOT NULL,
  KEY login_attempts_email (email, attempted_at),
  KEY login_attempts_ip (ip, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
