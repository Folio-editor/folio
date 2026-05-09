package com.storyzip.common.notification;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * 운영자 이메일 알림 — 환불 신청 등 인간 검토가 필요한 이벤트를 외부로 통지.
 *
 * <p>설정이 비활성화(빈 from/to 또는 mailSender 미주입)되면 조용히 로그만 남기고 패스.
 * dev/test 환경에서 SMTP 미설정 상태로도 깨지지 않도록.
 */
@Slf4j
@Component
public class EmailNotifier {

    private final Optional<JavaMailSender> mailSender;
    private final String from;
    private final String operatorTo;

    public EmailNotifier(
            Optional<JavaMailSender> mailSender,
            @Value("${storyzip.mail.from:}") String from,
            @Value("${storyzip.mail.operator-to:}") String operatorTo) {
        this.mailSender = mailSender;
        this.from = from;
        this.operatorTo = operatorTo;
    }

    /** 운영자 채널(2square.f203@gmail.com 등)로 메일 발송. 실패해도 호출자 트랜잭션을 깨뜨리지 않음. */
    public void notifyOperator(String subject, String body) {
        if (mailSender.isEmpty() || from.isBlank() || operatorTo.isBlank()) {
            log.info("[EMAIL_SKIPPED] subject={} reason=mail-disabled (sender={}, from={}, to={})",
                    subject, mailSender.isPresent(), !from.isBlank(), !operatorTo.isBlank());
            return;
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(operatorTo);
            message.setSubject(subject);
            message.setText(body);
            mailSender.get().send(message);
            log.info("[EMAIL_SENT] subject={} to={}", subject, operatorTo);
        } catch (Exception e) {
            log.error("[EMAIL_FAILED] subject={} reason={}", subject, e.getMessage(), e);
            // 알림 실패가 결제/환불 트랜잭션을 깨면 안 됨 — swallow
        }
    }
}
