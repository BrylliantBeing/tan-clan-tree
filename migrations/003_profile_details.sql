ALTER TABLE people
  ADD COLUMN phone VARCHAR(40) NULL AFTER facebook_url;

-- Kept apart from people, so loading the tree never reads image data
CREATE TABLE person_photos (
  person_id CHAR(36) NOT NULL PRIMARY KEY,
  content_type VARCHAR(20) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_person_photos_person FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
