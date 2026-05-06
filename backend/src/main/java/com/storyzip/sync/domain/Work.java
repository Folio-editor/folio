package com.storyzip.sync.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "work")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Work {
    @Id
    @Column(columnDefinition = "UUID")
    private UUID id;

    @Column(name = "writer_id", nullable = false, columnDefinition = "UUID")
    private UUID writerId;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(name = "author_name", length = 100)
    private String authorName;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "JSONB")
    private String genres;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "JSONB")
    private String moods;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "encrypted_dek", columnDefinition = "BYTEA")
    private byte[] encryptedDek;

    // Vault Transit envelope encryption: work_key 를 Vault 로 wrap 한 결과.
    // NULL = 오프라인 신규 작품 (온라인 복귀 시 발급) → AI 인덱싱 skip 대상.
    @Column(name = "server_encrypted_dek", columnDefinition = "BYTEA")
    private byte[] serverEncryptedDek;
}
