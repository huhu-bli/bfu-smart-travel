CREATE FUNCTION update_place_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER places_updated_at BEFORE UPDATE ON places
FOR EACH ROW EXECUTE FUNCTION update_place_timestamp();
