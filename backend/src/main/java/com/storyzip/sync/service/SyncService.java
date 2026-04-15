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
        Work entity = workRepo.findById(id).orElse(Work.builder().id(id).build());
        entity.setWriterId(writerId);
        entity.setTitle(str(data, "title", "제목 없음"));
        entity.setAuthorName(str(data, "author_name", null));
        entity.setDescription(str(data, "description", null));
        entity.setStatus(str(data, "status", "active"));
        entity.setSortOrder(integer(data, "sort_order", 0));
        entity.setCreatedAt(datetime(data, "created_at", entity.getCreatedAt()));
        entity.setUpdatedAt(datetime(data, "updated_at", LocalDateTime.now()));
        workRepo.save(entity);
    }

    // ── plan ────────────────────────────────────────────────────
    private void processPlan(String op, UUID id, Map<String, Object> data, UUID writerId) {
        if ("DELETE".equals(op)) { planRepo.deleteById(id); return; }
        Plan entity = planRepo.findById(id).orElse(Plan.builder().id(id).build());
        entity.setWriterId(writerId);
        entity.setWorkId(uuid(data, "work_id"));
        entity.setSlogan(str(data, "slogan", null));
        entity.setGenres(str(data, "genres", null));
        entity.setMoods(str(data, "moods", null));
        entity.setTargetAudience(str(data, "target_audience", null));
        entity.setContent(str(data, "content", null));
        entity.setCreatedAt(datetime(data, "created_at", entity.getCreatedAt()));
        entity.setUpdatedAt(datetime(data, "updated_at", LocalDateTime.now()));
        planRepo.save(entity);
    }

    // ── world_note ───────────────────────────────────────────────
    private void processWorldNote(String op, UUID id, Map<String, Object> data, UUID writerId) {
        if ("DELETE".equals(op)) { worldNoteRepo.deleteById(id); return; }
        WorldNote entity = worldNoteRepo.findById(id).orElse(WorldNote.builder().id(id).build());
        entity.setWriterId(writerId);
        entity.setWorkId(uuid(data, "work_id"));
        entity.setParentId(uuidOrNull(data, "parent_id"));
        entity.setName(str(data, "name", "새 문서"));
        entity.setContent(str(data, "content", null));
        entity.setSortOrder(integer(data, "sort_order", 0));
        entity.setCreatedAt(datetime(data, "created_at", entity.getCreatedAt()));
        entity.setUpdatedAt(datetime(data, "updated_at", LocalDateTime.now()));
        worldNoteRepo.save(entity);
    }

    // ── character ────────────────────────────────────────────────
    private void processCharacter(String op, UUID id, Map<String, Object> data, UUID writerId) {
        if ("DELETE".equals(op)) { characterRepo.deleteById(id); return; }
        Character entity = characterRepo.findById(id).orElse(Character.builder().id(id).build());
        entity.setWriterId(writerId);
        entity.setWorkId(uuid(data, "work_id"));
        entity.setName(str(data, "name", "이름 없음"));
        entity.setProfileImageUrl(str(data, "profile_image_url", null));
        entity.setGender(str(data, "gender", "unknown"));
        entity.setAge(str(data, "age", "unknown"));
        entity.setAppearance(str(data, "appearance", ""));
        entity.setMbti(str(data, "mbti", null));
        entity.setPersonality(str(data, "personality", null));
        entity.setContent(str(data, "content", null));
        entity.setSortOrder(integer(data, "sort_order", 0));
        entity.setCreatedAt(datetime(data, "created_at", entity.getCreatedAt()));
        entity.setUpdatedAt(datetime(data, "updated_at", LocalDateTime.now()));
        characterRepo.save(entity);
    }

    // ── character_custom_field ────────────────────────────────────
    private void processCharacterCustomField(String op, UUID id, Map<String, Object> data) {
        if ("DELETE".equals(op)) { charCustomFieldRepo.deleteById(id); return; }
        CharacterCustomField entity = charCustomFieldRepo.findById(id).orElse(CharacterCustomField.builder().id(id).build());
        entity.setCharacterId(uuid(data, "character_id"));
        entity.setFieldName(str(data, "field_name", ""));
        entity.setFieldValue(str(data, "field_value", null));
        entity.setSortOrder(integer(data, "sort_order", 0));
        entity.setCreatedAt(datetime(data, "created_at", entity.getCreatedAt()));
        entity.setUpdatedAt(datetime(data, "updated_at", LocalDateTime.now()));
        charCustomFieldRepo.save(entity);
    }

    // ── character_tag ─────────────────────────────────────────────
    private void processCharacterTag(String op, UUID id, Map<String, Object> data) {
        if ("DELETE".equals(op)) { charTagRepo.deleteById(id); return; }
        CharacterTag entity = charTagRepo.findById(id).orElse(CharacterTag.builder().id(id).build());
        entity.setCharacterId(uuid(data, "character_id"));
        entity.setWorldNoteId(uuid(data, "world_note_id"));
        entity.setCreatedAt(datetime(data, "created_at", entity.getCreatedAt()));
        charTagRepo.save(entity);
    }

    // ── plot ─────────────────────────────────────────────────────
    private void processPlot(String op, UUID id, Map<String, Object> data, UUID writerId) {
        if ("DELETE".equals(op)) { plotRepo.deleteById(id); return; }
        Plot entity = plotRepo.findById(id).orElse(Plot.builder().id(id).build());
        entity.setWriterId(writerId);
        entity.setWorkId(uuid(data, "work_id"));
        entity.setParentId(uuidOrNull(data, "parent_id"));
        entity.setTitle(str(data, "title", "제목 없음"));
        entity.setStatus(str(data, "status", null));
        entity.setContent(str(data, "content", null));
        entity.setSortOrder(integer(data, "sort_order", 0));
        entity.setCreatedAt(datetime(data, "created_at", entity.getCreatedAt()));
        entity.setUpdatedAt(datetime(data, "updated_at", LocalDateTime.now()));
        plotRepo.save(entity);
    }

    // ── episode ───────────────────────────────────────────────────
    private void processEpisode(String op, UUID id, Map<String, Object> data, UUID writerId) {
        if ("DELETE".equals(op)) { episodeRepo.deleteById(id); return; }
        Episode entity = episodeRepo.findById(id).orElse(Episode.builder().id(id).build());
        entity.setWriterId(writerId);
        entity.setWorkId(uuid(data, "work_id"));
        entity.setParentId(uuidOrNull(data, "parent_id"));
        entity.setTitle(str(data, "title", "제목 없음"));
        entity.setStatus(str(data, "status", "draft"));
        entity.setContent(str(data, "content", null));
        entity.setWordCount(integer(data, "word_count", 0));
        entity.setSortOrder(integer(data, "sort_order", 0));
        entity.setCreatedAt(datetime(data, "created_at", entity.getCreatedAt()));
        entity.setUpdatedAt(datetime(data, "updated_at", LocalDateTime.now()));
        episodeRepo.save(entity);
    }

    // ── plot_episode_link ─────────────────────────────────────────
    private void processPlotEpisodeLink(String op, UUID id, Map<String, Object> data) {
        if ("DELETE".equals(op)) { plotEpisodeLinkRepo.deleteById(id); return; }
        PlotEpisodeLink entity = plotEpisodeLinkRepo.findById(id).orElse(PlotEpisodeLink.builder().id(id).build());
        entity.setPlotId(uuid(data, "plot_id"));
        entity.setEpisodeId(uuid(data, "episode_id"));
        entity.setCreatedAt(datetime(data, "created_at", entity.getCreatedAt()));
        plotEpisodeLinkRepo.save(entity);
    }

    // ── foreshadow ────────────────────────────────────────────────
    private void processForeshadow(String op, UUID id, Map<String, Object> data, UUID writerId) {
        if ("DELETE".equals(op)) { foreshadowRepo.deleteById(id); return; }
        Foreshadow entity = foreshadowRepo.findById(id).orElse(Foreshadow.builder().id(id).build());
        entity.setWriterId(writerId);
        entity.setWorkId(uuid(data, "work_id"));
        entity.setTitle(str(data, "title", "제목 없음"));
        entity.setStatus(str(data, "status", "open"));
        entity.setImportance(str(data, "importance", "medium"));
        entity.setContent(str(data, "content", null));
        entity.setSortOrder(integer(data, "sort_order", 0));
        entity.setCreatedAt(datetime(data, "created_at", entity.getCreatedAt()));
        entity.setUpdatedAt(datetime(data, "updated_at", LocalDateTime.now()));
        foreshadowRepo.save(entity);
    }

    // ── foreshadow_link ───────────────────────────────────────────
    private void processForeshadowLink(String op, UUID id, Map<String, Object> data) {
        if ("DELETE".equals(op)) { foreshadowLinkRepo.deleteById(id); return; }
        ForeshadowLink entity = foreshadowLinkRepo.findById(id).orElse(ForeshadowLink.builder().id(id).build());
        entity.setForeshadowId(uuid(data, "foreshadow_id"));
        entity.setLinkType(str(data, "link_type", ""));
        entity.setEpisodeId(uuidOrNull(data, "episode_id"));
        entity.setPlotId(uuidOrNull(data, "plot_id"));
        entity.setContextMemo(str(data, "context_memo", null));
        entity.setCreatedAt(datetime(data, "created_at", entity.getCreatedAt()));
        foreshadowLinkRepo.save(entity);
    }

    // ── idea_archive ──────────────────────────────────────────────
    private void processIdeaArchive(String op, UUID id, Map<String, Object> data, UUID writerId) {
        if ("DELETE".equals(op)) { ideaArchiveRepo.deleteById(id); return; }
        IdeaArchive entity = ideaArchiveRepo.findById(id).orElse(IdeaArchive.builder().id(id).build());
        entity.setWriterId(writerId);
        entity.setWorkId(uuid(data, "work_id"));
        entity.setContent(str(data, "content", ""));
        entity.setTag(str(data, "tag", null));
        entity.setSortOrder(integer(data, "sort_order", 0));
        entity.setCreatedAt(datetime(data, "created_at", entity.getCreatedAt()));
        entity.setUpdatedAt(datetime(data, "updated_at", LocalDateTime.now()));
        ideaArchiveRepo.save(entity);
    }

    // ── helpers ───────────────────────────────────────────────────
    private String str(Map<String, Object> data, String key, String defaultVal) {
        Object v = data.get(key);
        return v != null ? v.toString() : defaultVal;
    }

    private Integer integer(Map<String, Object> data, String key, Integer defaultVal) {
        Object v = data.get(key);
        if (v == null) return defaultVal;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(v.toString()); } catch (NumberFormatException e) { return defaultVal; }
    }

    private UUID uuid(Map<String, Object> data, String key) {
        Object v = data.get(key);
        return v != null ? UUID.fromString(v.toString()) : null;
    }

    private UUID uuidOrNull(Map<String, Object> data, String key) {
        Object v = data.get(key);
        if (v == null || v.toString().isBlank()) return null;
        return UUID.fromString(v.toString());
    }

    private LocalDateTime datetime(Map<String, Object> data, String key, LocalDateTime defaultVal) {
        Object v = data.get(key);
        if (v == null) return defaultVal != null ? defaultVal : LocalDateTime.now();
        try {
            String s = v.toString();
            // ISO-8601 with or without trailing Z
            if (s.endsWith("Z")) s = s.substring(0, s.length() - 1);
            return LocalDateTime.parse(s, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        } catch (Exception e) {
            return defaultVal != null ? defaultVal : LocalDateTime.now();
        }
    }
}
