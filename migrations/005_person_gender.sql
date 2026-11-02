-- Chinese family terms depend on it, such as Ahia and Achi. Blank until someone fills it in.
ALTER TABLE people
  ADD COLUMN gender ENUM('male', 'female') NULL AFTER full_name;
