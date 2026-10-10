package java.util;

/** Missing TeaVM classlib exception required by Scanner's public contract. */
public class InputMismatchException extends NoSuchElementException {
    private static final long serialVersionUID = 8811230760997066428L;
    public InputMismatchException() { super(); }
    public InputMismatchException(String message) { super(message); }
}
