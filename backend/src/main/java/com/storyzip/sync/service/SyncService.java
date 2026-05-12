package com.storyzip.sync.service;

import com.storyzip.ai.client.EpisodeIndexingTrigger;
import com.storyzip.sync.domain.*;
import com.storyzip.sync.domain.Character;
import com.storyzip.sync.dto.SyncUploadRequest;
import com.storyzip.sync.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
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
@Slf4j
@RequiredArgsConstructor
public class SyncService {

    private final WorkRepository workRepo;
    private final PlanNoteRepository planNoteRepo;
    private final WorldNoteRepository worldNoteRepo;
    private final CharacterRepository characterRepo;
    private final CharacterNoteRepository characterNoteRepo;
    private final CharacterCustomFieldRepository charCustomFieldRepo;
    private final CharacterTagRepository charTagRepo;
    private final PlotRepository plotRepo;
    private final EpisodeRepository episodeRepo;
    private final PlotEpisodeLinkRepository plotEpisodeLinkRepo;
    private final ForeshadowRepository foreshadowRepo;
    private final ForeshadowLinkRepository foreshadowLinkRepo;
    private final IdeaArchiveRepository ideaArchiveRepo;

    /**
     * Episode 인덱싱 + 요약 파이프라인 트리거 (curious-wiggling-thacker plan V-6, R-9).
     * SyncService 와 SuggestionApplier 가 공유. afterCommit 등록·디바운스·구독 게이트·dek 검증 일체 위임.
     */
    private final EpisodeIndexingTrigger episodeIndexingTrigger;

    /**
     * entry 1건을 독립 트랜잭션으로 처리.
     * REQUIRES_NEW로 격리하여 한 entry의 실패가 다른 entry에 영향을 주지 않도록 한다.
     * SyncController는 DataIntegrityViolationException을 swallow하여 폭주를 방지한다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void process(SyncUploadRequest req, UUID writerId) {
        UUID id = UUID.fromString(req.id());
        String op = req.op();
        String table = req.table();
        Map<String, Object> data = req.data() != null ? req.data() : Map.of();

        switch (table) {
            case "work" -> processWork(op, id, data, writerId);
            case "plan_note" -> processPlanNote(op, id, data, writerId);
            case "world_note" -> processWorldNote(op, id, data, writerId);
            case "character" -> processCharacter(op, id, data, writerId);
            case "character_note" -> processCharacterNote(op, id, data, writerId);
            case "character_custom_field" -> processCharacterCustomField(op, id, data, writerId);
            case "character_tag" -> processCharacterTag(op, id, data, writerId);
            case "plot" -> processPlot(op, id, data, writerId);
            case "episode" -> processEpisode(op, id, data, writerId);
            case "plot_episode_link" -> processPlotEpisodeLink(op, id, data, writerId);
            case "foreshadow" -> processForeshadow(op, id, data, writerId);
            case "foreshadow_link" -> processForeshadowLink(op, id, data, writerId);
            case "idea_archive" -> processIdeaArchive(op, id, data, writerId);
            default -> throw new IllegalArgumentException("Unknown sync table: " + table);
        }
    }

    // ── work ────────────────────────────────────────────────────
    private void processWork(String op, UUID id, Map<String, Object> data, UUID writerId) {
        Work e = workRepo.findById(id).orElse(null);
        if (!ownsEntity(writerId, e != null ? e.getWriterId() : null, "work", id)) return;
        if ("DELETE".equals(op)) {
            if (e != null) workRepo.deleteById(id);
            return;
        }
        if (e == null) {
            if ("PATCH".equals(op)) return;  // PATCH 대상 없음 — 무시
            e = Work.builder().id(id).build();
        }
        e.setWriterId(writerId);
        applyStr(data, "title",         e::setTitle);
        applyStr(data, "author_name",   e::setAuthorName);
        applyStr(data, "description",   e::setDescription);
        applyStr(data, "status",        e::setStatus);
        applyInt(data, "sort_order",    e::setSortOrder);
        applyStr(data, "genres",        e::setGenres);
        applyStr(data, "moods",         e::setMoods);
        applyDt(data,  "created_at",    e::setCreatedAt);
        applyBytea(data, "encrypted_dek", e::setEncryptedDek);
        applyStr(data, "kind", e::setKind);
        // server_encrypted_dek 는 클라이언트가 직접 만들지 않고 WorkServerDekController 에서
        // VaultKmsService.encrypt() 로 발급. 그러나 PowerSync sync 페이로드에 포함되어
        // 다중 디바이스 일관성을 유지하므로 그대로 통과.
        applyBytea(data, "server_encrypted_dek", e::setServerEncryptedDek);
        e.setUpdatedAt(LocalDateTime.now());
        // 신규 insert인 경우 NOT NULL 기본값 보정
        if (e.getTitle() == null) e.setTitle("제목 없음");
        if (e.getStatus() == null) e.setStatus("연재중");
        if (e.getSortOrder() == null) e.setSortOrder(0);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        workRepo.save(e);
    }

    // ── plan_note ────────────────────────────────────────────────
    // (구) plan 테이블·processPlan 은 ERD 정리 2단계로 폐기됨.
    //   plan_note 가 work_id 를 직접 FK 로 가지고 있어 plan 행 자체가 불필요.
    private void processPlanNote(String op, UUID id, Map<String, Object> data, UUID writerId) {
        PlanNote e = planNoteRepo.findById(id).orElse(null);
        if (!ownsEntity(writerId, e != null ? e.getWriterId() : null, "plan_note", id)) return;
        if ("DELETE".equals(op)) {
            if (e != null) planNoteRepo.deleteById(id);
            return;
        }
        if (e == null) {
            if ("PATCH".equals(op)) return;
            e = PlanNote.builder().id(id).build();
        }
        e.setWriterId(writerId);
        applyUuid(data, "work_id",    e::setWorkId);
        applyStr(data,  "title",      e::setTitle);
        applyStr(data,  "content",    e::setContent);
        applyInt(data,  "sort_order", e::setSortOrder);
        applyDt(data,   "created_at", e::setCreatedAt);
        e.setUpdatedAt(LocalDateTime.now());
        if (e.getTitle() == null) e.setTitle("새 문서");
        if (e.getSortOrder() == null) e.setSortOrder(0);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        // FK 대상이 아직 동기화되지 않았으면 skip
        if (e.getWorkId() != null && !workRepo.existsById(e.getWorkId())) {
            logFkSkip("plan_note", id, "work_id", e.getWorkId());
            return;
        }
        planNoteRepo.save(e);
    }

    // ── world_note ───────────────────────────────────────────────
    private void processWorldNote(String op, UUID id, Map<String, Object> data, UUID writerId) {
        WorldNote e = worldNoteRepo.findById(id).orElse(null);
        if (!ownsEntity(writerId, e != null ? e.getWriterId() : null, "world_note", id)) return;
        if ("DELETE".equals(op)) {
            if (e != null) worldNoteRepo.deleteById(id);
            return;
        }
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
        if (e.getWorkId() != null && !workRepo.existsById(e.getWorkId())) {
            logFkSkip("world_note", id, "work_id", e.getWorkId());
            return;
        }
        if (e.getParentId() != null && !worldNoteRepo.existsById(e.getParentId())) {
            logFkSkip("world_note", id, "parent_id", e.getParentId());
            return;
        }
        worldNoteRepo.save(e);
    }

    // ── character ────────────────────────────────────────────────
    private void processCharacter(String op, UUID id, Map<String, Object> data, UUID writerId) {
        Character e = characterRepo.findById(id).orElse(null);
        if (!ownsEntity(writerId, e != null ? e.getWriterId() : null, "character", id)) return;
        if ("DELETE".equals(op)) {
            if (e != null) characterRepo.deleteById(id);
            return;
        }
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
        applyInt(data,  "sort_order",        e::setSortOrder);
        applyDt(data,   "created_at",        e::setCreatedAt);
        e.setUpdatedAt(LocalDateTime.now());
        if (e.getName() == null) e.setName("이름 없음");
        if (e.getGender() == null) e.setGender("미설정");
        if (e.getAge() == null) e.setAge("");
        if (e.getSortOrder() == null) e.setSortOrder(0);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        if (e.getWorkId() != null && !workRepo.existsById(e.getWorkId())) {
            logFkSkip("character", id, "work_id", e.getWorkId());
            return;
        }
        characterRepo.save(e);
    }

    // ── character_note ────────────────────────────────────────────
    private void processCharacterNote(String op, UUID id, Map<String, Object> data, UUID writerId) {
        CharacterNote e = characterNoteRepo.findById(id).orElse(null);
        if (!ownsEntity(writerId, e != null ? e.getWriterId() : null, "character_note", id)) return;
        if ("DELETE".equals(op)) {
            if (e != null) characterNoteRepo.deleteById(id);
            return;
        }
        if (e == null) {
            if ("PATCH".equals(op)) return;
            e = CharacterNote.builder().id(id).build();
        }
        e.setWriterId(writerId);
        applyUuid(data, "character_id", e::setCharacterId);
        applyStr(data,  "kind",         e::setKind);
        applyStr(data,  "title",        e::setTitle);
        applyStr(data,  "content",      e::setContent);
        applyInt(data,  "sort_order",   e::setSortOrder);
        applyDt(data,   "created_at",   e::setCreatedAt);
        e.setUpdatedAt(LocalDateTime.now());
        if (e.getKind() == null) e.setKind("custom");
        if (e.getTitle() == null) e.setTitle("새 문서");
        if (e.getSortOrder() == null) e.setSortOrder(0);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        // FK 대상이 아직 동기화되지 않았으면 skip
        if (e.getCharacterId() != null && !characterRepo.existsById(e.getCharacterId())) {
            logFkSkip("character_note", id, "character_id", e.getCharacterId());
            return;
        }
        characterNoteRepo.save(e);
    }

    // ── character_custom_field ────────────────────────────────────
    private void processCharacterCustomField(String op, UUID id, Map<String, Object> data, UUID writerId) {
        CharacterCustomField e = charCustomFieldRepo.findById(id).orElse(null);
        // writer_id 컬럼이 없으므로 부모 character의 writer_id로 소유권 검증
        UUID parentCharacterId = e != null ? e.getCharacterId() : uuid(data, "character_id");
        if (parentCharacterId != null) {
            Character parent = characterRepo.findById(parentCharacterId).orElse(null);
            if (parent != null && !ownsEntity(writerId, parent.getWriterId(), "character_custom_field", id)) return;
        }
        if ("DELETE".equals(op)) {
            if (e != null) charCustomFieldRepo.deleteById(id);
            return;
        }
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
        // FK 대상이 아직 동기화되지 않았으면 skip
        if (e.getCharacterId() != null && !characterRepo.existsById(e.getCharacterId())) {
            logFkSkip("character_custom_field", id, "character_id", e.getCharacterId());
            return;
        }
        charCustomFieldRepo.save(e);
    }

    // ── character_tag ─────────────────────────────────────────────
    private void processCharacterTag(String op, UUID id, Map<String, Object> data, UUID writerId) {
        // (character_id, world_note_id) 복합 UNIQUE 제약 → 같은 페어로 살아있는 row가 있으면
        // id가 달라도 그것을 update 대상으로 재사용. processPlotEpisodeLink 동일 패턴.
        UUID characterId = uuid(data, "character_id");
        UUID worldNoteId = uuid(data, "world_note_id");
        CharacterTag e = null;
        if (characterId != null && worldNoteId != null) {
            e = charTagRepo.findByCharacterIdAndWorldNoteId(characterId, worldNoteId).orElse(null);
        }
        if (e == null) {
            e = charTagRepo.findById(id).orElse(null);
        }
        // writer_id 미보유 → 부모 character의 writer_id로 소유권 검증
        UUID parentCharacterId = e != null ? e.getCharacterId() : characterId;
        if (parentCharacterId != null) {
            Character parent = characterRepo.findById(parentCharacterId).orElse(null);
            if (parent != null && !ownsEntity(writerId, parent.getWriterId(), "character_tag", id)) return;
        }
        if ("DELETE".equals(op)) {
            if (e != null) charTagRepo.deleteById(e.getId());
            return;
        }
        if (e == null) {
            if ("PATCH".equals(op)) return;
            e = CharacterTag.builder().id(id).build();
        }
        applyUuid(data, "character_id",  e::setCharacterId);
        applyUuid(data, "world_note_id", e::setWorldNoteId);
        applyDt(data,   "created_at",    e::setCreatedAt);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        // FK 대상이 아직 동기화되지 않았으면 skip
        if (e.getCharacterId() != null && !characterRepo.existsById(e.getCharacterId())) {
            logFkSkip("character_tag", id, "character_id", e.getCharacterId());
            return;
        }
        if (e.getWorldNoteId() != null && !worldNoteRepo.existsById(e.getWorldNoteId())) {
            logFkSkip("character_tag", id, "world_note_id", e.getWorldNoteId());
            return;
        }
        charTagRepo.save(e);
    }

    // ── plot ─────────────────────────────────────────────────────
    private void processPlot(String op, UUID id, Map<String, Object> data, UUID writerId) {
        Plot e = plotRepo.findById(id).orElse(null);
        if (!ownsEntity(writerId, e != null ? e.getWriterId() : null, "plot", id)) return;
        if ("DELETE".equals(op)) {
            if (e != null) plotRepo.deleteById(id);
            return;
        }
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
        if (e.getWorkId() != null && !workRepo.existsById(e.getWorkId())) {
            logFkSkip("plot", id, "work_id", e.getWorkId());
            return;
        }
        if (e.getParentId() != null && !plotRepo.existsById(e.getParentId())) {
            logFkSkip("plot", id, "parent_id", e.getParentId());
            return;
        }
        plotRepo.save(e);
    }

    // ── episode ───────────────────────────────────────────────────
    private void processEpisode(String op, UUID id, Map<String, Object> data, UUID writerId) {
        Episode e = episodeRepo.findById(id).orElse(null);
        if (!ownsEntity(writerId, e != null ? e.getWriterId() : null, "episode", id)) return;
        if ("DELETE".equals(op)) {
            if (e != null) episodeRepo.deleteById(id);
            return;
        }
        // R-6 B-3: status 가 'completed' 로 *새로 진입* 한 경우만 요약 트리거. 매 PUT/PATCH 폭주 방지.
        String prevStatus = (e != null) ? e.getStatus() : null;
        // 본문 변경 여부 감지용 — applyStr 가 e.content 를 덮기 전에 옛 값 캡처.
        // PowerSync 는 row 전체를 전송하지만 작가가 본문 외 메타 (sort_order/title 등) 만
        // 바꿨다면 프론트는 기존 ciphertext 를 그대로 echo (재암호화 X) — 따라서 ciphertext
        // 직접 비교만으로 본문 변경을 정확히 식별. 비교 일치 → fireIndexing skip (임베딩 비용 절감).
        String oldContent = (e != null) ? e.getContent() : null;
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
        if (e.getStatus() == null) e.setStatus("예정");
        if (e.getWordCount() == null) e.setWordCount(0);
        if (e.getSortOrder() == null) e.setSortOrder(0);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        if (e.getWorkId() != null && !workRepo.existsById(e.getWorkId())) {
            logFkSkip("episode", id, "work_id", e.getWorkId());
            return;
        }
        if (e.getParentId() != null && !episodeRepo.existsById(e.getParentId())) {
            logFkSkip("episode", id, "parent_id", e.getParentId());
            return;
        }
        episodeRepo.save(e);

        // Vault Transit 전환 (curious-wiggling-thacker plan V-6):
        // server_encrypted_dek 가 발급된 작품에 한해 AI 인덱싱 파이프라인 자동 호출.
        // - server_encrypted_dek NULL 인 작품 (오프라인 신규, pending) 은 skip → 발급 후 다음 sync 때 자동 동작
        // - 본문은 ciphertext 로만 서버에 저장됨 → AI 서버가 internal API 로 평문 fetch (V-7)
        // - 동일 episode 5초 내 재호출 디바운스 (PUT + PATCH 연속 도착 흡수)
        log.info("[AI-TRACE] processEpisode saved episode={} prevStatus={} newStatus={} workId={} writerId={}",
                id, prevStatus, e.getStatus(), e.getWorkId(), writerId);
        // 본문 미변경 (sort_order/title/status 등 메타만 갱신) sync 는 indexing skip.
        // 프론트가 같은 plaintext 에 대해 동일 ciphertext 를 echo 하는 한 ciphertext 비교로 충분.
        boolean contentChanged = !java.util.Objects.equals(oldContent, e.getContent());
        if (contentChanged && e.getContent() != null) {
            episodeIndexingTrigger.fireIndexing(id, e.getWorkId(), writerId);
        } else {
            log.info("[AI-TRACE] pipeline=indexing skip episode={} reason=content_unchanged", id);
        }
        // summary: 완성 신규 진입 OR (완성 유지 + 본문 변경) — fireSummary 내부 가드 참조.
        episodeIndexingTrigger.fireSummary(id, e.getWorkId(), writerId, prevStatus, e.getStatus(), contentChanged);
    }

    // ── plot_episode_link ─────────────────────────────────────────
    private void processPlotEpisodeLink(String op, UUID id, Map<String, Object> data, UUID writerId) {
        // plot_id, episode_id 모두 UNIQUE 제약 → 같은 plot/episode로 살아있는 row가 있으면
        // id가 달라도 그것을 update 대상으로 재사용. character_tag 와 동일 패턴.
        UUID plotId    = uuid(data, "plot_id");
        UUID episodeId = uuid(data, "episode_id");
        PlotEpisodeLink e = null;
        if (plotId != null) {
            e = plotEpisodeLinkRepo.findByPlotId(plotId).orElse(null);
        }
        if (e == null && episodeId != null) {
            e = plotEpisodeLinkRepo.findByEpisodeId(episodeId).orElse(null);
        }
        if (e == null) {
            e = plotEpisodeLinkRepo.findById(id).orElse(null);
        }
        // writer_id 미보유 → 부모 plot의 writer_id로 소유권 검증
        UUID parentPlotId = e != null ? e.getPlotId() : plotId;
        if (parentPlotId != null) {
            Plot parent = plotRepo.findById(parentPlotId).orElse(null);
            if (parent != null && !ownsEntity(writerId, parent.getWriterId(), "plot_episode_link", id)) return;
        }
        if ("DELETE".equals(op)) {
            if (e != null) plotEpisodeLinkRepo.deleteById(e.getId());
            return;
        }
        if (e == null) {
            if ("PATCH".equals(op)) return;
            e = PlotEpisodeLink.builder().id(id).build();
        }
        applyUuid(data, "plot_id",    e::setPlotId);
        applyUuid(data, "episode_id", e::setEpisodeId);
        applyDt(data,   "created_at", e::setCreatedAt);
        if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
        // FK 대상이 아직 동기화되지 않았으면 skip — 다음 sync 사이클에서 재시도
        if (e.getPlotId() != null && !plotRepo.existsById(e.getPlotId())) {
            logFkSkip("plot_episode_link", id, "plot_id", e.getPlotId());
            return;
        }
        if (e.getEpisodeId() != null && !episodeRepo.existsById(e.getEpisodeId())) {
            logFkSkip("plot_episode_link", id, "episode_id", e.getEpisodeId());
            return;
        }
        plotEpisodeLinkRepo.save(e);
    }

    // ── foreshadow ────────────────────────────────────────────────
    private void processForeshadow(String op, UUID id, Map<String, Object> data, UUID writerId) {
        Foreshadow e = foreshadowRepo.findById(id).orElse(null);
        if (!ownsEntity(writerId, e != null ? e.getWriterId() : null, "foreshadow", id)) return;
        if ("DELETE".equals(op)) {
            if (e != null) foreshadowRepo.deleteById(id);
            return;
        }
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
        if (e.getWorkId() != null && !workRepo.existsById(e.getWorkId())) {
            logFkSkip("foreshadow", id, "work_id", e.getWorkId());
            return;
        }
        foreshadowRepo.save(e);
    }

    // ── foreshadow_link ───────────────────────────────────────────
    private void processForeshadowLink(String op, UUID id, Map<String, Object> data, UUID writerId) {
        ForeshadowLink e = foreshadowLinkRepo.findById(id).orElse(null);
        // writer_id 미보유 → 부모 foreshadow의 writer_id로 소유권 검증
        UUID parentForeshadowId = e != null ? e.getForeshadowId() : uuid(data, "foreshadow_id");
        if (parentForeshadowId != null) {
            Foreshadow parent = foreshadowRepo.findById(parentForeshadowId).orElse(null);
            if (parent != null && !ownsEntity(writerId, parent.getWriterId(), "foreshadow_link", id)) return;
        }
        if ("DELETE".equals(op)) {
            if (e != null) foreshadowLinkRepo.deleteById(id);
            return;
        }
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
        // foreshadow_id는 NOT NULL FK — 미존재 시 skip
        if (e.getForeshadowId() != null && !foreshadowRepo.existsById(e.getForeshadowId())) {
            logFkSkip("foreshadow_link", id, "foreshadow_id", e.getForeshadowId());
            return;
        }
        // episode_id/plot_id는 nullable + ON DELETE SET NULL — dangling 참조면 null로 정리.
        // 둘 다 null이 되면 CHECK 제약 위반 → Controller에서 swallow됨 (의도된 동작).
        if (e.getEpisodeId() != null && !episodeRepo.existsById(e.getEpisodeId())) {
            e.setEpisodeId(null);
        }
        if (e.getPlotId() != null && !plotRepo.existsById(e.getPlotId())) {
            e.setPlotId(null);
        }
        foreshadowLinkRepo.save(e);
    }

    // ── idea_archive ──────────────────────────────────────────────
    private void processIdeaArchive(String op, UUID id, Map<String, Object> data, UUID writerId) {
        IdeaArchive e = ideaArchiveRepo.findById(id).orElse(null);
        if (!ownsEntity(writerId, e != null ? e.getWriterId() : null, "idea_archive", id)) return;
        if ("DELETE".equals(op)) {
            if (e != null) ideaArchiveRepo.deleteById(id);
            return;
        }
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
        if (e.getWorkId() != null && !workRepo.existsById(e.getWorkId())) {
            logFkSkip("idea_archive", id, "work_id", e.getWorkId());
            return;
        }
        ideaArchiveRepo.save(e);
    }

    // ── ownership / FK helpers ────────────────────────────────────
    /**
     * 기존 row의 writer_id가 현재 요청자와 일치하는지 확인.
     * actualOwner == null인 경우(신규 row)는 통과.
     * 불일치 시 [SyncSecurity] WARN 로그 + false 반환 → 호출 측에서 silent skip.
     * 응답으로 알리지 않음(id 열거 공격 방지).
     */
    private boolean ownsEntity(UUID currentWriter, UUID actualOwner, String table, UUID id) {
        if (actualOwner == null) return true;
        if (!currentWriter.equals(actualOwner)) {
            log.warn("[SyncSecurity] forbidden cross-user update: writerId={} actualOwner={} table={} id={}",
                    currentWriter, actualOwner, table, id);
            return false;
        }
        return true;
    }

    /** [SyncFKSkip] 로그 prefix를 일관되게 출력. */
    private void logFkSkip(String table, UUID id, String fk, UUID value) {
        log.warn("[SyncFKSkip] missing parent: table={} id={} fk={} value={}", table, id, fk, value);
    }

    // ── data accessor helpers ─────────────────────────────────────
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

    /**
     * BYTEA 컬럼 — PowerSync가 BYTEA를 직접 못 보내서 클라이언트가 Base64 문자열로 전송한다.
     * 서버는 받자마자 디코드해 byte[]로 컬럼에 저장한다 (DB에는 진짜 BYTEA로 들어감).
     */
    private static void applyBytea(Map<String, Object> data, String key, Consumer<byte[]> setter) {
        if (!data.containsKey(key)) return;
        Object v = data.get(key);
        if (v == null) { setter.accept(null); return; }
        String s = v.toString();
        if (s.isBlank()) { setter.accept(null); return; }
        try { setter.accept(Base64.getDecoder().decode(s)); }
        catch (IllegalArgumentException e) { /* 값 유지 — 잘못된 페이로드 무시 */ }
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

    // uuid() 헬퍼: 복합 UNIQUE 제약 entity (character_tag, plot_episode_link 등) 에서
    // data 의 컬럼 값으로 기존 entity 를 미리 조회할 때 사용.
    private UUID uuid(Map<String, Object> data, String key) {
        Object v = data.get(key);
        return v != null ? UUID.fromString(v.toString()) : null;
    }
}
