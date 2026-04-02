-- CreateIndex
CREATE INDEX "bookings_status_createdAt_idx" ON "bookings"("status", "createdAt");

-- CreateIndex
CREATE INDEX "bookings_destination_idx" ON "bookings"("destination");

-- CreateIndex
CREATE INDEX "logs_eventType_timestamp_idx" ON "logs"("eventType", "timestamp");

-- CreateIndex
CREATE INDEX "logs_level_timestamp_idx" ON "logs"("level", "timestamp");

-- CreateIndex
CREATE INDEX "profiles_isActive_idx" ON "profiles"("isActive");

-- CreateIndex
CREATE INDEX "profiles_priority_idx" ON "profiles"("priority");

-- CreateIndex
CREATE INDEX "profiles_isActive_priority_idx" ON "profiles"("isActive", "priority");

-- CreateIndex
CREATE INDEX "proxies_status_idx" ON "proxies"("status");

-- CreateIndex
CREATE INDEX "proxies_status_lastUsedAt_idx" ON "proxies"("status", "lastUsedAt");

-- CreateIndex
CREATE INDEX "proxies_host_idx" ON "proxies"("host");
