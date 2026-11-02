-- Someone with an adoptive parent is drawn under them, with a dashed line to their birth parents
ALTER TABLE parent_child
  ADD COLUMN kind ENUM('birth', 'adoptive') NOT NULL DEFAULT 'birth';
