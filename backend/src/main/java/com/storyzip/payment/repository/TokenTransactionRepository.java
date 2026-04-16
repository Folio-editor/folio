package com.storyzip.payment.repository;

import com.storyzip.payment.domain.TokenTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface TokenTransactionRepository extends JpaRepository<TokenTransaction, UUID> {
}
