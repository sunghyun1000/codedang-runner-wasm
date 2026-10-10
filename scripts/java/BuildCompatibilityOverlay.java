import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.zip.GZIPOutputStream;

/** Packages our separate reader overlay in the upstream ArchiveReader format. */
public final class BuildCompatibilityOverlay {
    public static void main(String[] args) throws Exception {
        byte[] name = "org/teavm/classlib/java/io/TInputStreamReader.class".getBytes(StandardCharsets.UTF_8);
        byte[] bytes = Files.readAllBytes(Path.of(args[0]));
        try (DataOutputStream output = new DataOutputStream(new GZIPOutputStream(
                Files.newOutputStream(Path.of(args[1]))))) {
            output.writeShort(name.length);
            output.write(name);
            output.writeInt(bytes.length);
            output.write(bytes);
        }
    }
}
