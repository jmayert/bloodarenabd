-- CreateTable
CREATE TABLE `donors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `location` VARCHAR(255) NOT NULL,
    `bloodGroup` VARCHAR(5) NOT NULL,
    `lastDonation` VARCHAR(10) NULL,
    `totalDonations` INTEGER NOT NULL DEFAULT 0,
    `badgeLevel` VARCHAR(20) NULL,
    `willingToDonate` VARCHAR(3) NOT NULL DEFAULT 'yes',
    `regGeo` VARCHAR(120) NULL,
    `regIp` VARCHAR(45) NULL,
    `regDevice` VARCHAR(100) NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `authUid` VARCHAR(128) NULL,
    `authEmail` VARCHAR(190) NULL,
    `gender` VARCHAR(10) NULL,
    `hideMe` BOOLEAN NOT NULL DEFAULT false,
    `allowCall` BOOLEAN NOT NULL DEFAULT true,
    `deviceId` VARCHAR(100) NULL,

    INDEX `idx_auth_uid`(`authUid`),
    INDEX `idx_blood_group`(`bloodGroup`),
    INDEX `idx_location`(`location`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blood_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `patientName` VARCHAR(100) NOT NULL,
    `bloodGroup` VARCHAR(5) NOT NULL,
    `hospital` VARCHAR(200) NOT NULL,
    `contact` VARCHAR(20) NOT NULL,
    `urgency` VARCHAR(10) NOT NULL DEFAULT 'High',
    `bagsNeeded` INTEGER NOT NULL,
    `note` VARCHAR(500) NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'Active',
    `reqIp` VARCHAR(45) NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `authUid` VARCHAR(128) NULL,
    `requiredAt` DATETIME NULL,
    `hospitalLat` DECIMAL(10, 7) NULL,
    `hospitalLng` DECIMAL(10, 7) NULL,
    `verifiedLocation` BOOLEAN NOT NULL DEFAULT false,
    `donationCode` VARCHAR(6) NULL,
    `codeUses` INTEGER NOT NULL DEFAULT 0,
    `reqDeviceId` VARCHAR(100) NULL,

    INDEX `idx_donation_code`(`donationCode`),
    INDEX `idx_status_urgency`(`status`, `urgency`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `request_documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `requestId` INTEGER NOT NULL,
    `filePath` VARCHAR(255) NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `mime` VARCHAR(20) NOT NULL DEFAULT 'image/jpeg',
    `bytes` INTEGER NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_token`(`token`),
    INDEX `idx_request`(`requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `donorId` INTEGER NOT NULL,
    `donorAuthUid` VARCHAR(128) NULL,
    `requesterAuthUid` VARCHAR(128) NULL,
    `requesterName` VARCHAR(120) NOT NULL,
    `requesterPhone` VARCHAR(20) NULL,
    `bloodGroup` VARCHAR(5) NOT NULL,
    `message` VARCHAR(500) NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_donor`(`donorId`),
    INDEX `idx_donor_uid`(`donorAuthUid`),
    INDEX `idx_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `call_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `donorId` INTEGER NOT NULL,
    `callerName` VARCHAR(120) NULL,
    `callerPhone` VARCHAR(20) NULL,
    `callerIp` VARCHAR(45) NULL,
    `callerLocation` VARCHAR(255) NULL,
    `deviceInfo` VARCHAR(255) NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_donor`(`donorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `donorPhone` VARCHAR(20) NOT NULL,
    `harasserInfo` VARCHAR(255) NOT NULL,
    `reportComment` TEXT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `analytics_counters` (
    `counterName` VARCHAR(50) NOT NULL,
    `counterValue` BIGINT UNSIGNED NOT NULL DEFAULT 0,

    PRIMARY KEY (`counterName`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `deviceId` VARCHAR(100) NOT NULL,
    `type` VARCHAR(30) NOT NULL,
    `message` TEXT NOT NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_device_read`(`deviceId`, `isRead`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `senderName` VARCHAR(100) NOT NULL,
    `senderPhone` VARCHAR(20) NULL,
    `message` TEXT NOT NULL,
    `deviceId` VARCHAR(100) NOT NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `adminReply` TEXT NULL,
    `repliedAt` DATETIME NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_device`(`deviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `firebaseUid` VARCHAR(128) NOT NULL,
    `provider` VARCHAR(10) NOT NULL,
    `email` VARCHAR(190) NULL,
    `phone` VARCHAR(20) NULL,
    `name` VARCHAR(120) NULL,
    `deviceId` VARCHAR(100) NULL,
    `lastLogin` DATETIME NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `verifyChannel` VARCHAR(20) NULL,
    `verifyPhone` VARCHAR(20) NULL,
    `telegramChatId` VARCHAR(40) NULL,
    `verifiedAt` DATETIME NULL,

    UNIQUE INDEX `uniq_uid`(`firebaseUid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `otp_verifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `authUid` VARCHAR(128) NOT NULL,
    `channel` VARCHAR(30) NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `tgChatId` VARCHAR(40) NULL,
    `codeHash` VARCHAR(255) NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME NOT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_token`(`token`),
    INDEX `idx_auth_uid`(`authUid`),
    INDEX `idx_phone`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sms_otp` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `phone` VARCHAR(15) NOT NULL,
    `otpHash` VARCHAR(255) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL,
    `isUsed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expiresAt` DATETIME NOT NULL,
    `authUid` VARCHAR(128) NULL,

    INDEX `idx_phone_otp`(`phone`, `otpHash`),
    INDEX `idx_uid_created`(`authUid`, `createdAt`),
    INDEX `idx_phone_created`(`phone`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `donation_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `authUid` VARCHAR(128) NOT NULL,
    `donorId` INTEGER NOT NULL,
    `donationDate` DATE NOT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `source` VARCHAR(12) NOT NULL DEFAULT 'code',
    `note` VARCHAR(140) NULL,
    `reportedIp` VARCHAR(45) NULL,

    INDEX `idx_auth_uid`(`authUid`),
    INDEX `idx_donor`(`donorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `code_redemptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `requestId` INTEGER NOT NULL,
    `donorId` INTEGER NOT NULL,
    `donorAuthUid` VARCHAR(128) NOT NULL,
    `donationCode` VARCHAR(6) NOT NULL,
    `redeemedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_request`(`requestId`),
    UNIQUE INDEX `uniq_req_donor`(`requestId`, `donorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `online_visitors` (
    `visitorToken` VARCHAR(100) NOT NULL,
    `lastSeen` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`visitorToken`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `visitors` (
    `sessionId` VARCHAR(100) NOT NULL,
    `lastSeen` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `page` VARCHAR(255) NULL,

    INDEX `idx_last_seen`(`lastSeen`),
    PRIMARY KEY (`sessionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fcm_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fcmToken` VARCHAR(512) NOT NULL,
    `deviceId` VARCHAR(100) NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uniq_token`(`fcmToken`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `push_subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `endpoint` TEXT NOT NULL,
    `p256dh` TEXT NULL,
    `auth` TEXT NULL,
    `deviceId` VARCHAR(100) NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `device_tokens` (
    `deviceId` VARCHAR(100) NOT NULL,
    `context` VARCHAR(30) NULL,
    `ip` VARCHAR(45) NULL,
    `ua` VARCHAR(300) NULL,
    `updatedAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`deviceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `community_posts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(191) NOT NULL,
    `authUid` VARCHAR(128) NULL,
    `displayName` VARCHAR(120) NOT NULL DEFAULT 'Anonymous',
    `content` TEXT NOT NULL,
    `rating` INTEGER NULL,
    `ipAddress` VARCHAR(45) NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_type`(`type`),
    INDEX `idx_created`(`createdAt`),
    INDEX `idx_auth_uid`(`authUid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `community_replies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `postId` INTEGER NOT NULL,
    `authUid` VARCHAR(128) NULL,
    `displayName` VARCHAR(120) NOT NULL DEFAULT 'Anonymous',
    `content` TEXT NOT NULL,
    `ipAddress` VARCHAR(45) NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_post_id`(`postId`),
    INDEX `idx_created`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `community_action_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `actorId` VARCHAR(128) NOT NULL,
    `actionType` VARCHAR(10) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_actor_time`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rate_limits` (
    `key` VARCHAR(150) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `windowStart` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `count` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`key`, `action`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(60) NOT NULL,
    `passHash` VARCHAR(255) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'moderator',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uniq_username`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `request_documents` ADD CONSTRAINT `request_documents_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `blood_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `code_redemptions` ADD CONSTRAINT `code_redemptions_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `blood_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `community_replies` ADD CONSTRAINT `community_replies_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `community_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

