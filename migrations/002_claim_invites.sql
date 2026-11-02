-- An invite either adds a new person (relation_type and relative_id are set)
-- or gives a login to an existing profile (claim_person_id is set)
ALTER TABLE invites
  MODIFY relation_type ENUM('spouse', 'child', 'parent') NULL,
  MODIFY relative_id CHAR(36) NULL,
  ADD COLUMN claim_person_id CHAR(36) NULL AFTER other_parent_id,
  ADD KEY invites_claim_person (claim_person_id),
  ADD CONSTRAINT fk_invites_claim_person FOREIGN KEY (claim_person_id) REFERENCES people (id) ON DELETE CASCADE;
