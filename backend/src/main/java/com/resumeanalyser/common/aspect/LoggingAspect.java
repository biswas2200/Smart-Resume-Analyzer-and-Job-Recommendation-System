package com.resumeanalyser.common.aspect;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Aspect
@Component
@Order(1)
public class LoggingAspect {

    @Pointcut("execution(public * com.resumeanalyser..*Controller.*(..))")
    public void controllerMethods() {}

    @Pointcut("execution(public * com.resumeanalyser..*Service.*(..))")
    public void serviceMethods() {}

    // Args/return values are intentionally not logged: request DTOs in this app
    // carry raw passwords (RegisterRequest/LoginRequest) and responses carry
    // JWTs (AuthResponse) that must never end up in application logs.
    @Around("controllerMethods() || serviceMethods()")
    public Object logExecution(ProceedingJoinPoint joinPoint) throws Throwable {
        Logger log = LoggerFactory.getLogger(joinPoint.getTarget().getClass());
        String method = joinPoint.getSignature().toShortString();
        long start = System.currentTimeMillis();

        log.debug("-> {}", method);
        try {
            Object result = joinPoint.proceed();
            log.info("{} completed in {}ms", method, System.currentTimeMillis() - start);
            return result;
        } catch (Throwable ex) {
            log.warn("{} failed in {}ms: {}: {}",
                    method, System.currentTimeMillis() - start, ex.getClass().getSimpleName(), ex.getMessage());
            throw ex;
        }
    }
}
