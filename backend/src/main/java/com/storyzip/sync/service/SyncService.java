package com.storyzip.sync.service;

import com.storyzip.sync.domain.*;
import com.storyzip.sync.domain.Character;
import com.storyzip.sync.dto.SyncUploadRequest;
import com.storyzip.sync.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * PowerSync CRUD 업로드 처리.
 *
 * <p>op 종류:
 * <ul>
 *   <li>PUT    — 전체 행. 포함된 컬럼만 존재 (null 컬럼은 data에서 생략됨).</li>
 *   <li>PATCH  — 변경된 컬럼만 전송.</li>
 *   <li>DELETE — id만.</li>
 * </ul>
 *
 * <p>따라서 setter는 {@code data.containsKey(key)}일 때만 호출해야 한다.
 * 그렇지 않으면 PATCH에서 포함 안 된 NOT NULL 컬럼이 null로 덮어써져 제약 위반.
 *
 * <p>writer_id는 예외 — 보안상 항상 JWT 값으로 덮어쓴다.
 * updated_at은 항상 서버 시각으로 갱신한다.
 */
@Service
@RequiredArgsConstructor
public class SyncService {

    private final WorkRepository workRepo;
    private final PlanRepository planRepo;
    private final WorldNoteRepository worldNoteRepo;
    private final CharacterRepository characterRepo;
    private final CharacterCustomFieldRepository charCustomFieldRepo;
    private final CharacterTagRepository charTagRepo;
    private final PlotRepository plotRepo;
    private final EpisodeRepository episodeRepo;
    private final PlotEpisodeLinkRepository plotEpisodeLinkRepo;
    private final ForeshadowRepository foreshadowRepo;
    private final ForeshadowLinkRepository foreshadowLinkRepo;
    private final IdeaArchiveRepository ideaArchiveRepo;

    @Transactional
    public void process(SyncUploadRequest req, UUID writerId) {
        UUID id = UUID.fromString(req.id());
        String op = req.op();
        String table = req.table();
        Map<String, Object> data = req.data() != null ? req.data() : Map.of();

        switch (table) {
            case "work" -> processWork(op, id, data, writerId);
            case "plan" -> processPlan(op, id, data, writerId);
            case "world_note" -> processWorldNote(op, id, data, writerId);
            case "character" -> processCharacter(op, id, data, writerId);
            case "character_custom_field" -> processCharacterCustomField(op, id, data);
            case "character_tag" -> processCharacterTag(op, id, data);
            case "plot" -> processPlot(op, id, data, writerId);
            case "episode" -> processEpisode(op, id, data, writerId);
            case "plot_episode_link" -> processPlotEpisodeLink(op, id, data);
            case "foreshadow" -> processForeshadow(op, id, data, writerId);
            case "foreshadow_link" -> processForeshadowLink(op, id, data);
            case "idea_archive" -> processIdeaArchive(op, id, data, writerId);
            default -> throw new IllegalArgumentException("Unknown sync table: " + table);
        }
    }

    // ── work ────────────────────────────────────────────────────
    private void processWork(String op, UUID id, Map<String, Object> data, UUID writerId) {
        if ("DELETE".equals(op)) { workRepo.deleteById(id); return; }
        Work e = workRepo.findById(id).orElse(null);
        if (e == null) {
            if ("PATCH".equals(op)) return;  // PATCH 대상 없음 — 무시
            e = Work.builder().id(id).build();
        }
        e.setWriterId(writerId);
        applyStr(data, "title",       e::setTitle);
        applyStr(data, "author_name", e::setAuthorName);
        applyStr(data, "description", e::setDescription);
        applyStr(data, "status",      e::setStatus);
        applyInt(data, "sort_order",  e::setSortOrder);
        applyDt(data,  "created_at",  e::setCreatedAt);
        e.setUpdatedAt(LocalDateTime.now());
        // 신규 insert인 경우 NOT NULL 기본값 보정
        if (e.getTitle() == null) e.setTitle("제목 없음");
        if (e.getStatus() == null) e.setStatus("연재중");
        if (e.getSortOrder() == null) e.setSortOrder(0);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        workRepo.save(e);
    }

    // ── plan ────────────────────────────────────────────────────
    private void processPlan(String op, UUID id, Map<String, Object> data, UUID writerId) {
        if ("DELETE".equals(op)) { planRepo.deleteById(id); return; }
        UUID workId = uuid(data, "work_id");
        // 1:1 UNIQUE 제약 → work_id로 기존 entity 선 조회, 없으면 id로 조회
        Plan e = null;
        if (workId != null) {
            e = planRepo.findByWorkId(workId).orElse(null);
        }
        if (e == null) {
            e = planRepo.findById(id).orElse(null);
        }
        if (e == null) {
            if ("PATCH".equals(op)) return;  // PATCH 대상 없음 — 무시
            e = Plan.builder().id(id).build();
        }
        e.setWriterId(writerId);
        applyUuid(data, "work_id", e::setWorkId);
        applyStr(data,  "slogan",          e::setSlogan);
        applyStr(data,  "genres",          e::setGenres);
        applyStr(data,  "moods",           e::setMoods);
        applyStr(data,  "target_audience", e::setTargetAudience);
        applyStr(data,  "content",         e::setContent);
        applyDt(data,   "created_at",      e::setCreatedAt);
        e.setUpdatedAt(LocalDateTime.now());
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        planRepo.save(e);
    }

    // ── world_note ───────────────────────────────────────────────
    private void processWorldNote(String op, UUID id, Map<String, Object> data, UUID writerId) {
        if ("DELETE".equals(op)) { worldNoteRepo.deleteById(id); return; }
        WorldNote e = worldNoteRepo.findById(id).orElse(null);
        if (e == null) {
            if ("PATCH".equals(op)) return;
            e = WorldNote.builder().id(id).build();
        }
        e.setWriterId(writerId);
        applyUuid(data,  "work_id",    e::setWorkId);
        applyUuidN(data, "parent_id",  e::setParentId);
        applyStr(data,   "name",       e::setName);
        applyStr(data,   "content",    e::setContent);
        applyInt(data,   "sort_order", e::setSortOrder);
        applyDt(data,    "created_at", e::setCreatedAt);
        e.setUpdatedAt(LocalDateTime.now());
        if (e.getName() == null) e.setName("새 문서");
        if (e.getSortOrder() == null) e.setSortOrder(0);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        worldNoteRepo.save(e);
    }

    // ── character ────────────────────────────────────────────────
    private void processCharacter(String op, UUID id, Map<String, Object> data, UUID writerId) {
        if ("DELETE".equals(op)) { characterRepo.deleteById(id); return; }
        Character e = characterRepo.findById(id).orElse(null);
        if (e == null) {
            if ("PATCH".equals(op)) return;
            e = Character.builder().id(id).build();
        }
        e.setWriterId(writerId);
        applyUuid(data, "work_id",           e::setWorkId);
        applyStr(data,  "name",              e::setName);
        applyStr(data,  "profile_image_url", e::setProfileImageUrl);
        applyStr(data,  "gender",            e::setGender);
        applyStr(data,  "age",               e::setAge);
        applyStr(data,  "appearance",        e::setAppearance);
        applyStr(data,  "mbti",              e::setMbti);
        applyStr(data,  "personality",       e::setPersonality);
        applyStr(data,  "content",           e::setContent);
        applyInt(data,  "sort_order",        e::setSortOrder);
        applyDt(data,   "created_at",        e::setCreatedAt);
        e.setUpdatedAt(LocalDateTime.now());
        if (e.getName() == null) e.setName("이름 없음");
        if (e.getGender() == null) e.setGender("미설정");
        if (e.getAge() == null) e.setAge("");
        if (e.getAppearance() == null) e.setAppearance("");
        if (e.getSortOrder() == null) e.setSortOrder(0);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        characterRepo.save(e);
    }

    // ── character_custom_field ────────────────────────────────────
    private void processCharacterCustomField(String op, UUID id, Map<String, Object> data) {
        if ("DELETE".equals(op)) { charCustomFieldRepo.deleteById(id); return; }
        CharacterCustomField e = charCustomFieldRepo.findById(id).orElse(null);
        if (e == null) {
            if ("PATCH".equals(op)) return;
            e = CharacterCustomField.builder().id(id).build();
        }
        applyUuid(data, "character_id", e::setCharacterId);
        applyStr(data,  "field_name",   e::setFieldName);
        applyStr(data,  "field_value",  e::setFieldValue);
        applyInt(data,  "sort_order",   e::setSortOrder);
        applyDt(data,   "created_at",   e::setCreatedAt);
        e.setUpdatedAt(LocalDateTime.now());
        if (e.getFieldName() == null) e.setFieldName("");
        if (e.getSortOrder() == null) e.setSortOrder(0);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        charCustomFieldRepo.save(e);
    }

    // ── character_tag ─────────────────────────────────────────────
    private void processCharacterTag(String op, UUID id, Map<String, Object> data) {
        if ("DELETE".equals(op)) { charTagRepo.deleteById(id); return; }
        CharacterTag e = charTagRepo.findById(id).orElse(null);
        if (e == null) {
            if ("PATCH".equals(op)) return;
            e = CharacterTag.builder().id(id).build();
        }
        applyUuid(data, "character_id",  e::setCharacterId);
        applyUuid(data, "world_note_id", e::setWorldNoteId);
        applyDt(data,   "created_at",    e::setCreatedAt);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        charTagRepo.save(e);
    }

    // ── plot ─────────────────────────────────────────────────────
    private void processPlot(String op, UUID id, Map<String, Object> data, UUID writerId) {
        if ("DELETE".equals(op)) { plotRepo.deleteById(id); return; }
        Plot e = plotRepo.findById(id).orElse(null);
        if (e == null) {
            if ("PATCH".equals(op)) return;
            e = Plot.builder().id(id).build();
        }
        e.setWriterId(writerId);
        applyUuid(data,  "work_id",   e::setWorkId);
        applyUuidN(data, "parent_id", e::setParentId);
        applyStr(data,   "title",     e::setTitle);
        applyStr(data,   "status",    e::setStatus);
        applyStr(data,   "content",   e::setContent);
        applyInt(data,   "sort_order", e::setSortOrder);
        applyDt(data,    "created_at", e::setCreatedAt);
        e.setUpdatedAt(LocalDateTime.now());
        if (e.getTitle() == null) e.setTitle("제목 없음");
        if (e.getSortOrder() == null) e.setSortOrder(0);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        plotRepo.save(e);
    }

    // ── episode ───────────────────────────────────────────────────
    private void processEpisode(String op, UUID id, Map<String, Object> data, UUID writerId) {
        if ("DELETE".equals(op)) { episodeRepo.deleteById(id); return; }
        Episode e = episodeRepo.findById(id).orElse(null);
        if (e == null) {
            if ("PATCH".equals(op)) return;
            e = Episode.builder().id(id).build();
        }
        e.setWriterId(writerId);
        applyUuid(data,  "work_id",    e::setWorkId);
        applyUuidN(data, "parent_id",  e::setParentId);
        applyStr(data,   "title",      e::setTitle);
        applyStr(data,   "status",     e::setStatus);
        applyStr(data,   "content",    e::setContent);
        applyInt(data,   "word_count", e::setWordCount);
        applyInt(data,   "sort_order", e::setSortOrder);
        applyDt(data,    "created_at", e::setCreatedAt);
        e.setUpdatedAt(LocalDateTime.now());
        if (e.getTitle() == null) e.setTitle("제목 없음");
        if (e.getStatus() == null) e.setStatus("미작성");
        if (e.getWordCount() == null) e.setWordCount(0);
        if (e.getSortOrder() == null) e.setSortOrder(0);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        episodeRepo.save(e);
    }

    // ── plot_episode_link ─────────────────────────────────────────
    private void processPlotEpisodeLink(String op, UUID id, Map<String, Object> data) {
        if ("DELETE".equals(op)) { plotEpisodeLinkRepo.deleteById(id); return; }
        PlotEpisodeLink e = plotEpisodeLinkRepo.findById(id).orElse(null);
        if (e == null) {
            if ("PATCH".equals(op)) return;
            e = PlotEpisodeLink.builder().id(id).build();
        }
        applyUuid(data, "plot_id",    e::setPlotId);
        applyUuid(data, "episode_id", e::setEpisodeId);
        applyDt(data,   "created_at", e::setCreatedAt);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        plotEpisodeLinkRepo.save(e);
    }

    // ── foreshadow ────────────────────────────────────────────────
    private void processForeshadow(String op, UUID id, Map<String, Object> data, UUID writerId) {
        if ("DELETE".equals(op)) { foreshadowRepo.deleteById(id); return; }
        Foreshadow e = foreshadowRepo.findById(id).orElse(null);
        if (e == null) {
            if ("PATCH".equals(op)) return;
            e = Foreshadow.builder().id(id).build();
        }
        e.setWriterId(writerId);
        applyUuid(data, "work_id",    e::setWorkId);
        applyStr(data,  "title",      e::setTitle);
        applyStr(data,  "status",     e::setStatus);
        applyStr(data,  "importance", e::setImportance);
        applyStr(data,  "content",    e::setContent);
        applyInt(data,  "sort_order", e::setSortOrder);
        applyDt(data,   "created_at", e::setCreatedAt);
        e.setUpdatedAt(LocalDateTime.now());
        if (e.getTitle() == null) e.setTitle("제목 없음");
        if (e.getStatus() == null) e.setStatus("진행중");
        if (e.getImportance() == null) e.setImportance("중");
        if (e.getSortOrder() == null) e.setSortOrder(0);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        foreshadowRepo.save(e);
    }

    // ── foreshadow_link ───────────────────────────────────────────
    private void processForeshadowLink(String op, UUID id, Map<String, Object> data) {
        if ("DELETE".equals(op)) { foreshadowLinkRepo.deleteById(id); return; }
        ForeshadowLink e = foreshadowLinkRepo.findById(id).orElse(null);
        if (e == null) {
            if ("PATCH".equals(op)) return;
            e = ForeshadowLink.builder().id(id).build();
        }
        applyUuid(data,  "foreshadow_id", e::setForeshadowId);
        applyStr(data,   "link_type",    e::setLinkType);
        applyUuidN(data, "episode_id",   e::setEpisodeId);
        applyUuidN(data, "plot_id",      e::setPlotId);
        applyStr(data,   "context_memo", e::setContextMemo);
        applyDt(data,    "created_at",   e::setCreatedAt);
        if (e.getLinkType() == null) e.setLinkType("");
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        foreshadowLinkRepo.save(e);
    }

    // ── idea_archive ──────────────────────────────────────────────
    private void processIdeaArchive(String op, UUID id, Map<String, Object> data, UUID writerId) {
        if ("DELETE".equals(op)) { ideaArchiveRepo.deleteById(id); return; }
        IdeaArchive e = ideaArchiveRepo.findById(id).orElse(null);
        if (e == null) {
            if ("PATCH".equals(op)) return;
            e = IdeaArchive.builder().id(id).build();
        }
        e.setWriterId(writerId);
        applyUuid(data, "work_id",    e::setWorkId);
        applyStr(data,  "content",    e::setContent);
        applyStr(data,  "tag",        e::setTag);
        applyInt(data,  "sort_order", e::setSortOrder);
        applyDt(data,   "created_at", e::setCreatedAt);
        e.setUpdatedAt(LocalDateTime.now());
        if (e.getContent() == null) e.setContent("");
        if (e.getSortOrder() == null) e.setSortOrder(0);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        ideaArchiveRepo.save(e);
    }

    // ── helpers ───────────────────────────────────────────────────
    // data에 key가 "존재할 때만" 설정 — PATCH에서 누락된 필드를 null로 덮어쓰는 것을 방지.
    private static void applyStr(Map<String, Object> data, String key, Consumer<String> setter) {
        if (data.containsKey(key)) {
            Object v = data.get(key);
            setter.accept(v != null ? v.toString() : null);
        }
    }

    private static void applyInt(Map<String, Object> data, String key, Consumer<Integer> setter) {
        if (!data.containsKey(key)) return;
        Object v = data.get(key);
        if (v == null) { setter.accept(null); return; }
        if (v instanceof Number n) { setter.accept(n.intValue()); return; }
        try { setter.accept(Integer.parseInt(v.toString())); } catch (NumberFormatException e) { /* 값 유지 */ }
    }

    private static void applyUuid(Map<String, Object> data, String key, Consumer<UUID> setter) {
        if (!data.containsKey(key)) return;
        Object v = data.get(key);
        setter.accept(v != null ? UUID.fromString(v.toString()) : null);
    }

    /** parent_id, episode_id 등 선택적 UUID — null/blank 허용 */
    private static void applyUuidN(Map<String, Object> data, String key, Consumer<UUID> setter) {
        if (!data.containsKey(key)) return;
        Object v = data.get(key);
        if (v == null || v.toString().isBlank()) { setter.accept(null); return; }
        setter.accept(UUID.fromString(v.toString()));
    }

    private static void applyDt(Map<String, Object> data, String key, Consumer<LocalDateTime> setter) {
        if (!data.containsKey(key)) return;
        Object v = data.get(key);
        if (v == null) { setter.accept(null); return; }
        try {
            String s = v.toString();
            if (s.endsWith("Z")) s = s.substring(0, s.length() - 1);
            setter.accept(LocalDateTime.parse(s, DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        } catch (Exception e) { /* 값 유지 */ }
    }

    // uuid() 헬퍼는 processPlan에서 work_id 조회 시 사용 (findByWorkId)
    private UUID uuid(Map<String, Object> data, String key) {
        Object v = data.get(key);
        return v != null ? UUID.fromString(v.toString()) : null;
    }
}
