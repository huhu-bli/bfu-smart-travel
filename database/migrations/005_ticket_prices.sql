ALTER TABLE places ADD COLUMN ticket_price jsonb;
ALTER TABLE places ADD CONSTRAINT places_ticket_price_valid CHECK (
  ticket_price IS NULL OR (
    jsonb_typeof(ticket_price) = 'object'
    AND ticket_price ?& ARRAY['currency','min','max','basis']
    AND ticket_price->>'currency' = 'CNY'
    AND jsonb_typeof(ticket_price->'basis') = 'string'
    AND length(trim(ticket_price->>'basis')) BETWEEN 1 AND 500
    AND CASE WHEN jsonb_typeof(ticket_price->'min') = 'number' AND jsonb_typeof(ticket_price->'max') = 'number'
      THEN (ticket_price->>'min')::numeric BETWEEN 0 AND 100000
        AND (ticket_price->>'max')::numeric BETWEEN (ticket_price->>'min')::numeric AND 100000
        AND (ticket_price->>'min')::numeric = round((ticket_price->>'min')::numeric, 2)
        AND (ticket_price->>'max')::numeric = round((ticket_price->>'max')::numeric, 2)
      ELSE false END
  ) IS TRUE
);
