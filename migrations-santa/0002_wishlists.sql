-- Organiser chooses at creation whether people can write wishlists. Existing draws keep them on.
ALTER TABLE draws ADD COLUMN wishlists INTEGER NOT NULL DEFAULT 1;
