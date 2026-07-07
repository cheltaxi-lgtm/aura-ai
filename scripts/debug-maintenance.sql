SELECT value->>'maintenanceMode' AS maintenance_mode FROM platform_settings WHERE key = 'features';
